// Client-side helpers: build a StreamFlow escrow or a direct SPL transfer to
// the launch vault, then call completeLock for the SOL payout.
import BN from "bn.js";
import {
  PublicKey,
  Transaction,
  Connection,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { SolanaStreamClient, ICluster } from "@streamflow/stream";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { completeLock, quoteLock } from "./locks.functions";

const RPC_URL =
  (import.meta.env.VITE_HELIUS_RPC_URL as string | undefined) ||
  (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) ||
  (typeof window !== "undefined" ? `${window.location.origin}/api/public/rpc` : "/api/public/rpc");

// Micro-lamports per compute unit. 200_000 * 400_000 CU ≈ 0.00008 SOL priority tip.
const PRIORITY_MICROLAMPORTS = 200_000;
const CU_LIMIT = 400_000;

/**
 * Poll for confirmation over HTTP — avoids WebSocket subscriptions that hang
 * on some hosted RPC providers.
 */
async function pollConfirm(conn: Connection, sig: string, lastValidBlockHeight: number) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const { value } = await conn.getSignatureStatuses([sig], { searchTransactionHistory: false });
    const st = value[0];
    if (st?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
    const height = await conn.getBlockHeight("confirmed").catch(() => 0);
    if (height > lastValidBlockHeight) throw new Error("Transaction expired before confirmation");
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timed out waiting for on-chain confirmation");
}

type WalletLike = {
  publicKey: { toString(): string };
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions?: (txs: any[]) => Promise<any[]>;
};

export type LockInput = {
  mint: string;
  amount: number;
  tierDays: number;
  wallet: WalletLike;
};

/** Detect whether a mint is classic SPL or Token-2022. */
async function detectTokenProgram(
  conn: Connection,
  mintPk: PublicKey,
): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mintPk);
  if (!info) throw new Error("Mint account not found");
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(`Unsupported token program: ${info.owner.toBase58()}`);
}

export async function runLockFlow({ mint, amount, tierDays, wallet }: LockInput) {
  const senderPk = wallet.publicKey.toString();

  const quote = await quoteLock({ data: { mint, amount, tier_days: tierDays } });
  if (quote.instant_sol <= 0) throw new Error("No SOL available in pool");
  if (quote.gross_sol > quote.available_sol) {
    const maxAmt = quote.max_amount_for_available;
    throw new Error(
      `Vault only has ${quote.available_sol.toFixed(4)} SOL available. This lock would pay out ${quote.gross_sol.toFixed(4)} SOL. Lower amount to ≤ ${maxAmt.toFixed(4)} tokens.`,
    );
  }

  const conn = new Connection(RPC_URL, "confirmed");
  const mintPk = new PublicKey(mint);
  const tokenProgram = await detectTokenProgram(conn, mintPk);

  const client = new SolanaStreamClient(RPC_URL, ICluster.Mainnet);
  const start = Math.floor(Date.now() / 1000) + 60;
  const durationSec = tierDays * 86400;
  const period = durationSec;
  const mintInfo = await getMint(conn, mintPk, "confirmed", tokenProgram);
  const decimals = mintInfo.decimals;
  const amountBaseUnits = new BN(Math.floor(amount * 10 ** decimals));

  const sender = {
    publicKey: new PublicKey(senderPk),
    signTransaction: wallet.signTransaction.bind(wallet),
    signAllTransactions:
      wallet.signAllTransactions?.bind(wallet) ??
      (async (txs: any[]) => Promise.all(txs.map((t) => wallet.signTransaction(t)))),
  };

  const res = await client.create(
    {
      recipient: senderPk,
      tokenId: mint,
      start,
      period,
      cliff: start + durationSec,
      amount: amountBaseUnits,
      amountPerPeriod: amountBaseUnits,
      cliffAmount: amountBaseUnits,
      name: `Instalock ${tierDays}d`,
      canTopup: false,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: true,
      withdrawalFrequency: durationSec,
    },
    { sender: sender as any },
  );

  const out = await completeLock({
    data: {
      mint,
      user_pubkey: senderPk,
      amount,
      tier_days: tierDays,
      custody: "streamflow",
      streamflow_id: res.metadataId,
      tx_lock: res.txId,
    },
  });

  return { streamflowId: res.metadataId, txLock: res.txId, ...out, quote };
}

/**
 * Vault custody: user signs an SPL transfer of `amount` tokens to the launch
 * wallet's ATA, then the server verifies the tx and pays out SOL. Supports
 * both classic SPL and Token-2022. Adds a priority-fee tip + compute-unit
 * limit and simulates the tx before sending so wallets don't flag it.
 */
export async function runVaultLockFlow({ mint, amount, tierDays, wallet }: LockInput) {
  const senderPk = wallet.publicKey.toString();

  const quote = await quoteLock({ data: { mint, amount, tier_days: tierDays } });
  if (quote.instant_sol <= 0) throw new Error("No SOL available in pool");
  if (quote.gross_sol > quote.available_sol) {
    const maxAmt = quote.max_amount_for_available;
    throw new Error(
      `Vault only has ${quote.available_sol.toFixed(4)} SOL available. This lock would pay out ${quote.gross_sol.toFixed(4)} SOL. Lower amount to ≤ ${maxAmt.toFixed(4)} tokens.`,
    );
  }

  const conn = new Connection(RPC_URL, "confirmed");
  const mintPk = new PublicKey(mint);
  const userPk = new PublicKey(senderPk);
  const vaultPk = new PublicKey(quote.launch_wallet);
  const tokenProgram = await detectTokenProgram(conn, mintPk);
  const mintInfo = await getMint(conn, mintPk, "confirmed", tokenProgram);
  const decimals = mintInfo.decimals;

  const userAta = await getAssociatedTokenAddress(mintPk, userPk, false, tokenProgram);
  const vaultAta = await getAssociatedTokenAddress(mintPk, vaultPk, false, tokenProgram);

  const tx = new Transaction();
  // Priority fee + CU limit — helps land the tx and avoids wallet risk flags.
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }),
  );
  const vaultAtaInfo = await conn.getAccountInfo(vaultAta);
  if (!vaultAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(userPk, vaultAta, vaultPk, mintPk, tokenProgram),
    );
  }
  const amountBase = BigInt(Math.floor(amount * 10 ** decimals));
  tx.add(
    createTransferCheckedInstruction(
      userAta,
      mintPk,
      vaultAta,
      userPk,
      amountBase,
      decimals,
      [],
      tokenProgram,
    ),
  );

  tx.feePayer = userPk;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  // Simulate first — surface program errors before the wallet prompts.
  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs?.join("\n") ?? "";
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${logs}`);
  }

  const signed = await wallet.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  // Poll for confirmation via HTTP instead of websocket — the wss subscription
  // hangs on some hosted RPCs (custom domain saw "stuck at LOCKING…"). We just
  // need the tx to land; completeLock re-verifies it server-side.
  await pollConfirm(conn, sig, lastValidBlockHeight);

  const out = await completeLock({
    data: {
      mint,
      user_pubkey: senderPk,
      amount,
      tier_days: tierDays,
      custody: "vault",
      tx_lock: sig,
    },
  });

  return { txLock: sig, ...out, quote };
}
