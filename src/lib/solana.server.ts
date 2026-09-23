import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

export const RPC_URL =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

export const PUMPPORTAL_API_URL =
  process.env.PUMPPORTAL_API_URL || "https://pumpportal.fun/api/trade-local";

export function getConnection() {
  return new Connection(RPC_URL, "confirmed");
}


export async function getBalanceSol(pubkey: string): Promise<number> {
  const conn = getConnection();
  const lamports = await conn.getBalance(new (await import("@solana/web3.js")).PublicKey(pubkey));
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Calls pumpportal.fun trade-local, signs the returned tx with provided
 * keypairs, and sends it to the cluster. Returns the signature.
 */
export async function pumpPortalLocalTx(
  body: Record<string, unknown>,
  signers: Keypair[],
): Promise<string> {
  const res = await fetch(PUMPPORTAL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    const txt = await res.text();
    throw new Error(`pumpportal trade-local ${res.status}: ${txt}`);
  }
  const data = new Uint8Array(await res.arrayBuffer());
  const tx = VersionedTransaction.deserialize(data);
  tx.sign(signers);
  const conn = getConnection();
  const sig = await conn.sendTransaction(tx);
  return sig;
}

export { Keypair, LAMPORTS_PER_SOL };
