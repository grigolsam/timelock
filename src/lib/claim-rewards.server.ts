/**
 * Isolated server-only implementation for the public rewards hook.
 * Keeping Solana imports out of the route module prevents SSR startup from
 * bundling wallet/transaction libraries into every request.
 */
export async function claimRewards() {
  const { Keypair } = await import("@solana/web3.js");
  const { decryptSecret } = await import("./crypto.server");
  const { pumpPortalLocalTx, getBalanceSol } = await import("./solana.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows, error } = await supabaseAdmin
    .from("launches")
    .select("id, wallet_pubkey, wallet_secret_encrypted, pool_sol, available_sol, claimed_sol")
    .eq("status", "live");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; sol?: number; error?: string }> = [];

  for (const row of rows ?? []) {
    try {
      const before = await getBalanceSol(row.wallet_pubkey);
      const kp = Keypair.fromSecretKey(decryptSecret(row.wallet_secret_encrypted));
      const sig = await pumpPortalLocalTx(
        {
          publicKey: kp.publicKey.toBase58(),
          action: "collectCreatorFee",
          priorityFee: 0.000001,
        },
        [kp],
      );
      await new Promise((r) => setTimeout(r, 4000));
      const after = await getBalanceSol(row.wallet_pubkey);
      const delta = Math.max(0, after - before);

      if (delta > 0) {
        await supabaseAdmin
          .from("launches")
          .update({
            pool_sol: Number(row.pool_sol) + delta,
            available_sol: Number(row.available_sol) + delta,
            claimed_sol: Number(row.claimed_sol) + delta,
            last_claim_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await supabaseAdmin
          .from("claims")
          .insert({ launch_id: row.id, amount_sol: delta, signature: sig });
      }
      results.push({ id: row.id, ok: true, sol: delta });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: (e as Error).message });
    }
  }

  return Response.json({ processed: results.length, results });
}