import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LOCK_TIERS, tierByDays } from "./lock-tiers";

const QuoteSchema = z.object({
  mint: z.string().min(32),
  amount: z.number().positive(),
  tier_days: z.number().int().positive(),
});

/**
 * Quote a lock: fetches launch + current pump.fun price and returns the SOL
 * value of the locked tokens plus the instant payout the user would receive.
 */
export const quoteLock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => QuoteSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPumpCoinData } = await import("./pump-price.server");

    const tier = tierByDays(data.tier_days);
    if (!tier) throw new Error("Invalid tier");

    const { data: launch, error } = await supabaseAdmin
      .from("launches")
      .select("id, mint, wallet_pubkey, available_sol, pool_sol")
      .eq("mint", data.mint)
      .eq("status", "live")
      .single();
    if (error) throw new Error(error.message);

    let priceSol = 0;
    let solUsd = 0;
    try {
      const coin = await getPumpCoinData(data.mint);
      priceSol = coin.price_sol_per_token;
      solUsd = coin.sol_usd_price;
    } catch {
      priceSol = 0;
    }

    const lockedSol = priceSol * data.amount;
    const gross = (lockedSol * tier.instantPct) / 100;
    const available = Number(launch.available_sol) || 0;
    const instantSol = Math.max(0, Math.min(gross, available));
    const lockedUsd = lockedSol * solUsd;
    const instantUsd = instantSol * solUsd;
    // Max token amount user could lock and still be fully covered by the vault.
    const maxAmountForAvailable =
      priceSol > 0 && tier.instantPct > 0
        ? (available * 100) / (tier.instantPct * priceSol)
        : 0;

    return {
      launch_id: launch.id,
      launch_wallet: launch.wallet_pubkey,
      price_sol_per_token: priceSol,
      sol_usd_price: solUsd,
      locked_sol: lockedSol,
      locked_usd: lockedUsd,
      available_sol: available,
      gross_sol: gross,
      instant_sol: instantSol,
      instant_usd: instantUsd,
      max_amount_for_available: maxAmountForAvailable,
      tier,
    };
  });

const CompleteSchema = z.object({
  mint: z.string().min(32).max(64),
  user_pubkey: z.string().min(32).max(64),
  amount: z.number().positive().max(1e15),
  tier_days: z.number().int().positive().max(3650),
  custody: z.enum(["streamflow", "vault"]).default("streamflow"),
  streamflow_id: z.string().min(32).max(64).optional(),
  tx_lock: z.string().min(32).max(128).optional(),
});

/**
 * Called after the client has locked tokens on-chain. Security invariants:
 *   1. Verify the lock tx (or streamflow escrow) on-chain before paying anything.
 *   2. Recompute the SOL payout server-side — never trust the client's number.
 *   3. Reserve the lock row FIRST (unique index on tx_lock / streamflow_id
 *      prevents replay); refuse if it already exists.
 *   4. Atomically debit the launch pool via SQL (`debit_launch_pool`) so parallel
 *      completeLock calls cannot overdraw available_sol.
 *   5. Only then sign & broadcast the SOL payout from the launch wallet.
 *   6. If the payout fails, roll back the pool debit and mark the lock failed.
 */
export const completeLock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CompleteSchema.parse(d))
  .handler(async ({ data }) => {
    const { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } =
      await import("@solana/web3.js");
    const { decryptSecret } = await import("./crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getConnection, RPC_URL } = await import("./solana.server");
    const { getPumpPriceSolPerToken } = await import("./pump-price.server");

    const tier = tierByDays(data.tier_days);
    if (!tier) throw new Error("Invalid tier");

    // Validate pubkeys parse before doing anything else.
    try {
      new PublicKey(data.user_pubkey);
      new PublicKey(data.mint);
    } catch {
      throw new Error("Invalid pubkey");
    }

    // Replay guard: reject if this tx_lock / streamflow_id was already used.
    // (A hard unique index enforces this at insert time as well.)
    if (data.tx_lock) {
      const { data: existing } = await supabaseAdmin
        .from("locks").select("id").eq("tx_lock", data.tx_lock).maybeSingle();
      if (existing) throw new Error("Lock tx already used");
    }
    if (data.streamflow_id) {
      const { data: existing } = await supabaseAdmin
        .from("locks").select("id").eq("streamflow_id", data.streamflow_id).maybeSingle();
      if (existing) throw new Error("Streamflow escrow already used");
    }

    const { data: launch, error } = await supabaseAdmin
      .from("launches")
      .select("id, mint, wallet_pubkey, wallet_secret_encrypted, available_sol, total_locked")
      .eq("mint", data.mint)
      .eq("status", "live")
      .single();
    if (error) throw new Error(error.message);

    let lockStartSec = Math.floor(Date.now() / 1000);

    // 1) Verify the lock on-chain
    if (data.custody === "streamflow") {
      if (!data.streamflow_id) throw new Error("streamflow_id required for streamflow custody");
      const { SolanaStreamClient, ICluster } = await import("@streamflow/stream");
      const { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
      const client = new SolanaStreamClient(RPC_URL, ICluster.Mainnet);
      const stream: any = await client.getOne({ id: data.streamflow_id });
      if (!stream) throw new Error("Streamflow stream not found");
      if (stream.mint !== data.mint) throw new Error("Stream mint mismatch");
      if (stream.recipient !== data.user_pubkey) throw new Error("Stream recipient mismatch");
      const nowSec = Math.floor(Date.now() / 1000);
      const endSec = Number(stream.end);
      const startSec = Number(stream.start);
      const duration = endSec - startSec;
      if (duration < tier.days * 86400 - 300) throw new Error("Stream duration too short");
      const conn = getConnection();
      const mintPk = new PublicKey(data.mint);
      const mintAcct = await conn.getAccountInfo(mintPk);
      const tokenProgram = mintAcct?.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const mintInfo = await getMint(conn, mintPk, "confirmed", tokenProgram);
      const depositedTokens = Number(stream.depositedAmount) / 10 ** mintInfo.decimals;
      if (depositedTokens + 0.01 < data.amount) throw new Error("Stream amount too small");
      if (nowSec > endSec) throw new Error("Stream already ended");
      lockStartSec = startSec;
    } else {
      // vault custody: verify the SPL transfer signature
      if (!data.tx_lock) throw new Error("tx_lock required for vault custody");
      const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } =
        await import("@solana/spl-token");
      const conn = getConnection();
      const mintPk = new PublicKey(data.mint);
      const launchPk = new PublicKey(launch.wallet_pubkey);
      const userPk = new PublicKey(data.user_pubkey);
      const mintAcct = await conn.getAccountInfo(mintPk);
      if (!mintAcct) throw new Error("Mint account not found");
      const tokenProgram = mintAcct.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const launchAta = await getAssociatedTokenAddress(mintPk, launchPk, false, tokenProgram);
      const userAta = await getAssociatedTokenAddress(mintPk, userPk, false, tokenProgram);

      const parsed = await conn.getParsedTransaction(data.tx_lock, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!parsed) throw new Error("Lock tx not found on-chain yet");
      if (parsed.meta?.err) throw new Error("Lock tx failed on-chain");

      const anyBal =
        parsed.meta?.postTokenBalances?.find((b) => b.mint === data.mint) ??
        parsed.meta?.preTokenBalances?.find((b) => b.mint === data.mint);
      const decimals = anyBal?.uiTokenAmount.decimals ?? 6;
      const expectedBaseUnits = BigInt(Math.floor(data.amount * 10 ** decimals));
      const preLaunch = parsed.meta?.preTokenBalances?.find(
        (b) => b.owner === launch.wallet_pubkey && b.mint === data.mint,
      );
      const postLaunch = parsed.meta?.postTokenBalances?.find(
        (b) => b.owner === launch.wallet_pubkey && b.mint === data.mint,
      );
      const preUser = parsed.meta?.preTokenBalances?.find(
        (b) => b.owner === data.user_pubkey && b.mint === data.mint,
      );
      const postUser = parsed.meta?.postTokenBalances?.find(
        (b) => b.owner === data.user_pubkey && b.mint === data.mint,
      );
      const launchDelta =
        BigInt(postLaunch?.uiTokenAmount.amount ?? "0") -
        BigInt(preLaunch?.uiTokenAmount.amount ?? "0");
      const userDelta =
        BigInt(preUser?.uiTokenAmount.amount ?? "0") -
        BigInt(postUser?.uiTokenAmount.amount ?? "0");
      const tolerance = 100n;
      if (launchDelta < expectedBaseUnits - tolerance)
        throw new Error(`Vault received too few tokens (${launchDelta} < ${expectedBaseUnits})`);
      if (userDelta < expectedBaseUnits - tolerance)
        throw new Error("User balance decrease doesn't match expected amount");
      // The signer of the lock tx must be the same user we're paying out to —
      // otherwise anyone could piggy-back on someone else's lock tx.
      const accountKeys = parsed.transaction.message.accountKeys.map((k: any) => ({
        key: (k.pubkey ?? k).toString(),
        signer: !!(k.signer ?? false),
      }));
      const signers = accountKeys.filter((k) => k.signer).map((k) => k.key);
      if (!signers.includes(data.user_pubkey))
        throw new Error("Lock tx not signed by user_pubkey");
      if (!accountKeys.some((k) => k.key === launchAta.toString()))
        throw new Error("Launch vault ATA not referenced in tx");
      if (!accountKeys.some((k) => k.key === userAta.toString()))
        throw new Error("User ATA not referenced in tx");
    }

    // 2) Recompute instant SOL server-side (never trust client)
    let priceSol = 0;
    try { priceSol = await getPumpPriceSolPerToken(data.mint); } catch { priceSol = 0; }
    const lockedSol = priceSol * data.amount;
    const gross = (lockedSol * tier.instantPct) / 100;
    const available = Number(launch.available_sol) || 0;
    if (gross > available)
      throw new Error(`Pool has ${available.toFixed(4)} SOL, this lock needs ${gross.toFixed(4)}`);
    const instantSol = Math.max(0, gross);
    if (instantSol <= 0) throw new Error("No SOL available for payout");

    // 3) Reserve the lock row (unique index prevents replay under race).
    const unlocksAt = new Date((lockStartSec + tier.days * 86400) * 1000).toISOString();
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("locks")
      .insert({
        launch_id: launch.id,
        mint: data.mint,
        user_pubkey: data.user_pubkey,
        amount_tokens: data.amount,
        duration_sec: tier.days * 86400,
        tier_days: tier.days,
        instant_pct: tier.instantPct,
        instant_sol: instantSol,
        custody: data.custody,
        streamflow_id: data.custody === "streamflow" ? data.streamflow_id! : null,
        tx_lock: data.tx_lock ?? null,
        tx_payout: null,
        status: "pending",
        unlocks_at: unlocksAt,
      })
      .select("id")
      .single();
    if (insErr) {
      // Unique-violation → replay attempt
      if ((insErr as any).code === "23505") throw new Error("Lock already recorded");
      throw new Error(insErr.message);
    }

    // 4) Atomic pool debit — fails cleanly if the pool is short.
    const { data: debited, error: debErr } = await supabaseAdmin.rpc("debit_launch_pool", {
      _launch_id: launch.id,
      _sol: instantSol,
      _tokens: data.amount,
    });
    if (debErr || debited !== true) {
      await supabaseAdmin.from("locks").delete().eq("id", inserted.id);
      throw new Error("Pool debit failed — insufficient SOL");
    }

    // 5) Send SOL
    let payoutSig: string;
    try {
      const conn = getConnection();
      const kp = Keypair.fromSecretKey(decryptSecret(launch.wallet_secret_encrypted));
      const recipient = new PublicKey(data.user_pubkey);
      const lamports = Math.floor(instantSol * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: recipient, lamports }),
      );
      tx.feePayer = kp.publicKey;
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(kp);
      payoutSig = await conn.sendRawTransaction(tx.serialize());
    } catch (payoutErr) {
      // Refund the pool and mark the lock failed. The tokens are already in the
      // vault; user can contact support with the lock id.
      await supabaseAdmin.rpc("debit_launch_pool", {
        _launch_id: launch.id,
        _sol: -instantSol,
        _tokens: -data.amount,
      });
      await supabaseAdmin.from("locks").update({ status: "failed" }).eq("id", inserted.id);
      throw payoutErr;
    }

    // 6) Finalize the row
    await supabaseAdmin
      .from("locks")
      .update({ status: "active", tx_payout: payoutSig })
      .eq("id", inserted.id);

    return { ok: true, instant_sol: instantSol, tx_payout: payoutSig };
  });


const ClaimSchema = z.object({
  lock_id: z.string().uuid(),
  user_pubkey: z.string(),
});

/**
 * Claim a matured vault lock. Verifies duration elapsed, then sends the locked
 * tokens back to the user from the launch wallet vault.
 */
export const claimVaultUnlock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ClaimSchema.parse(d))
  .handler(async ({ data }) => {
    const { Keypair, PublicKey, Transaction } = await import("@solana/web3.js");
    const {
      getAssociatedTokenAddress,
      createAssociatedTokenAccountInstruction,
      createTransferCheckedInstruction,
      getMint,
      TOKEN_PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID,
    } = await import("@solana/spl-token");
    const { decryptSecret } = await import("./crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getConnection } = await import("./solana.server");

    const { data: lock, error } = await supabaseAdmin
      .from("locks")
      .select("id, mint, user_pubkey, amount_tokens, custody, status, unlocks_at, launch_id")
      .eq("id", data.lock_id)
      .single();
    if (error) throw new Error(error.message);
    if (lock.custody !== "vault") throw new Error("Only vault locks can be claimed here");
    if (lock.status !== "active") throw new Error(`Lock is ${lock.status}`);
    // Tokens are always sent to lock.user_pubkey (the on-chain owner recorded
    // at lock time), so a caller cannot redirect the payout. This check just
    // rejects mismatched requests early.
    if (lock.user_pubkey !== data.user_pubkey) throw new Error("Not lock owner");
    if (new Date(lock.unlocks_at).getTime() > Date.now())
      throw new Error("Lock not yet unlocked");

    // Atomic state transition — prevents concurrent double-claim.
    const { data: reserved, error: rErr } = await supabaseAdmin
      .from("locks")
      .update({ status: "claiming" })
      .eq("id", lock.id)
      .eq("status", "active")
      .select("id")
      .single();
    if (rErr || !reserved) throw new Error("Lock already claimed or in progress");

    try {
      const { data: launch, error: le } = await supabaseAdmin
        .from("launches")
        .select("wallet_pubkey, wallet_secret_encrypted")
        .eq("id", lock.launch_id)
        .single();
      if (le) throw new Error(le.message);

      const conn = getConnection();
      const kp = Keypair.fromSecretKey(decryptSecret(launch.wallet_secret_encrypted));
      const mintPk = new PublicKey(lock.mint);
      const userPk = new PublicKey(lock.user_pubkey);
      const mintAcct = await conn.getAccountInfo(mintPk);
      if (!mintAcct) throw new Error("Mint account not found");
      const tokenProgram = mintAcct.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const mintInfo = await getMint(conn, mintPk, "confirmed", tokenProgram);
      const decimals = mintInfo.decimals;

      const vaultAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, tokenProgram);
      const userAta = await getAssociatedTokenAddress(mintPk, userPk, false, tokenProgram);

      const tx = new Transaction();
      const userAtaInfo = await conn.getAccountInfo(userAta);
      if (!userAtaInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(kp.publicKey, userAta, userPk, mintPk, tokenProgram),
        );
      }
      const amountBase = BigInt(Math.floor(Number(lock.amount_tokens) * 10 ** decimals));
      tx.add(
        createTransferCheckedInstruction(
          vaultAta,
          mintPk,
          userAta,
          kp.publicKey,
          amountBase,
          decimals,
          [],
          tokenProgram,
        ),
      );

      tx.feePayer = kp.publicKey;
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(kp);
      const sig = await conn.sendRawTransaction(tx.serialize());

      await supabaseAdmin
        .from("locks")
        .update({ status: "claimed" })
        .eq("id", lock.id);

      return { ok: true, tx: sig };
    } catch (err) {
      // Roll back the reservation so the user can retry.
      await supabaseAdmin
        .from("locks")
        .update({ status: "active" })
        .eq("id", lock.id)
        .eq("status", "claiming");
      throw err;
    }
  });

export const listLocksByMint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mint: z.string(), user_pubkey: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("locks")
      .select("id, mint, user_pubkey, amount_tokens, tier_days, instant_sol, tx_payout, custody, status, created_at, unlocks_at")
      .eq("mint", data.mint)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.user_pubkey) q = q.eq("user_pubkey", data.user_pubkey);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyLocks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ user_pubkey: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("locks")
      .select(
        "id, mint, amount_tokens, tier_days, instant_sol, tx_payout, tx_lock, custody, status, created_at, unlocks_at, launches:launch_id(name, symbol, image_url)",
      )
      .eq("user_pubkey", data.user_pubkey)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getWalletTokenBalance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ mint: z.string().min(32), owner: z.string().min(32) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { PublicKey } = await import("@solana/web3.js");
    const { getConnection } = await import("./solana.server");
    const conn = getConnection();
    try {
      const res = await conn.getParsedTokenAccountsByOwner(new PublicKey(data.owner), {
        mint: new PublicKey(data.mint),
      });
      let total = 0;
      for (const acc of res.value) {
        const amt = (acc.account.data as any)?.parsed?.info?.tokenAmount?.uiAmount;
        if (typeof amt === "number") total += amt;
      }
      return { balance: total };
    } catch {
      return { balance: 0 };
    }
  });

export { LOCK_TIERS };
