import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(500).default(""),
  image_url: z.string().default(""),
  twitter: z.string().default(""),
  telegram: z.string().default(""),
  website: z.string().default(""),
});

const FinalizeSchema = z.object({
  id: z.string().uuid(),
  dev_buy_sol: z.number().min(0).max(85),
});

export const createLaunch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data }) => {
    const bs58 = (await import("bs58")).default;
    const { Keypair } = await import("@solana/web3.js");
    const { encryptSecret } = await import("./crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const kp = Keypair.generate();
    const encrypted = encryptSecret(kp.secretKey);

    const { data: row, error } = await supabaseAdmin
      .from("launches")
      .insert({
        name: data.name,
        symbol: data.symbol,
        description: data.description,
        image_url: data.image_url || null,
        twitter: data.twitter || null,
        telegram: data.telegram || null,
        website: data.website || null,
        wallet_pubkey: kp.publicKey.toBase58(),
        wallet_secret_encrypted: encrypted,
        status: "pending",
      })
      .select("id, wallet_pubkey")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getLaunchStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getBalanceSol } = await import("./solana.server");
    const { data: row, error } = await supabaseAdmin
      .from("launches")
      .select("id, name, symbol, mint, wallet_pubkey, status, launch_tx")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    let balance = 0;
    try {
      balance = await getBalanceSol(row.wallet_pubkey);
    } catch {
      /* ignore rpc errors */
    }
    return { ...row, balance_sol: balance };
  });

export const finalizeLaunch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FinalizeSchema.parse(d))
  .handler(async ({ data }) => {
    const { Keypair } = await import("@solana/web3.js");
    const { decryptSecret } = await import("./crypto.server");
    const { pumpPortalLocalTx, getBalanceSol } = await import("./solana.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("launches")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (row.status === "live") return { mint: row.mint, signature: row.launch_tx };

    const balance = await getBalanceSol(row.wallet_pubkey);
    const needed = data.dev_buy_sol + 0.02; // dev buy + fees buffer
    if (balance < needed) {
      throw new Error(
        `Wallet has ${balance.toFixed(4)} SOL, need at least ${needed.toFixed(4)} SOL`,
      );
    }

    const creator = Keypair.fromSecretKey(decryptSecret(row.wallet_secret_encrypted));
    const mint = Keypair.generate();

    // 1. Upload image + metadata JSON to IPFS via Pinata
    const pinataJWT = process.env.PINATA_JWT;
    if (!pinataJWT) throw new Error("PINATA_JWT not configured");
    const pinataHeaders = { Authorization: `Bearer ${pinataJWT}` };

    let imageIpfsUrl = "";
    if (row.image_url) {
      let blob: Blob | null = null;
      if (row.image_url.startsWith("storage://")) {
        const path = row.image_url.replace("storage://", "");
        const { data: file, error: dlErr } = await supabaseAdmin.storage
          .from("launch-images")
          .download(path);
        if (dlErr) throw new Error(`Image download failed: ${dlErr.message}`);
        blob = file;
      } else {
        const imgRes = await fetch(row.image_url);
        if (imgRes.ok) blob = await imgRes.blob();
      }
      if (blob) {
        const imgForm = new FormData();
        imgForm.append("network", "public");
        imgForm.append("file", blob, "image.png");
        const imgUp = await fetch("https://uploads.pinata.cloud/v3/files", {
          method: "POST",
          headers: pinataHeaders,
          body: imgForm,
        });
        if (!imgUp.ok) throw new Error(`Pinata image upload failed: ${await imgUp.text()}`);
        const imgJson = (await imgUp.json()) as { data: { cid: string } };
        imageIpfsUrl = `https://ipfs.io/ipfs/${imgJson.data.cid}`;
      }
    }

    const metadata = {
      name: row.name,
      symbol: row.symbol,
      description: row.description || "",
      image: imageIpfsUrl,
      twitter: row.twitter || "",
      telegram: row.telegram || "",
      website: row.website || "",
      showName: true,
    };
    const metaForm = new FormData();
    metaForm.append("network", "public");
    metaForm.append(
      "file",
      new File([JSON.stringify(metadata)], "metadata.json", { type: "application/json" }),
    );
    const metaUp = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: pinataHeaders,
      body: metaForm,
    });
    if (!metaUp.ok) throw new Error(`Pinata metadata upload failed: ${await metaUp.text()}`);
    const metaJson = (await metaUp.json()) as { data: { cid: string } };
    const ipfs = { metadataUri: `https://ipfs.io/ipfs/${metaJson.data.cid}` };

    // 2. Create + sign + send
    const sig = await pumpPortalLocalTx(
      {
        publicKey: creator.publicKey.toBase58(),
        action: "create",
        tokenMetadata: {
          name: row.name,
          symbol: row.symbol,
          uri: ipfs.metadataUri,
        },
        mint: mint.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: data.dev_buy_sol,
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      },
      [creator, mint],
    );

    await supabaseAdmin
      .from("launches")
      .update({ status: "live", mint: mint.publicKey.toBase58(), launch_tx: sig })
      .eq("id", row.id);

    return { mint: mint.publicKey.toBase58(), signature: sig };
  });

async function resolveImageUrl(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  raw: string | null,
): Promise<string | null> {
  if (!raw) return null;
  if (!raw.startsWith("storage://")) return raw;
  const path = raw.replace("storage://", "");
  const { data } = await admin.storage.from("launch-images").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

export const listLaunches = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getPumpCoinData } = await import("./pump-price.server");
  const { data, error } = await supabaseAdmin
    .from("launches")
    .select(
      "id, mint, name, symbol, description, image_url, pool_sol, available_sol, claimed_sol, total_locked, status, created_at",
    )
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return await Promise.all(
    rows.map(async (r) => {
      const coin = await getPumpCoinData(r.mint || "").catch(() => ({
        price_sol_per_token: 0,
        usd_market_cap: 0,
        total_supply: 1_000_000_000,
      }));
      return {
        ...r,
        image_url: await resolveImageUrl(supabaseAdmin, r.image_url),
        price_sol_per_token: coin.price_sol_per_token,
        usd_market_cap: coin.usd_market_cap,
      };
    }),
  );
});

export const getLaunchByMint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mint: z.string().min(32) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPumpCoinData } = await import("./pump-price.server");
    const { data: row, error } = await supabaseAdmin
      .from("launches")
      .select(
        "id, mint, name, symbol, description, image_url, twitter, telegram, website, pool_sol, available_sol, claimed_sol, total_locked, status, created_at, wallet_pubkey",
      )
      .eq("mint", data.mint)
      .eq("status", "live")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return row;
    const coin = await getPumpCoinData(data.mint).catch(() => ({
      price_sol_per_token: 0,
      usd_market_cap: 0,
      total_supply: 1_000_000_000,
    }));
    return {
      ...row,
      image_url: await resolveImageUrl(supabaseAdmin, row.image_url),
      price_sol_per_token: coin.price_sol_per_token,
      usd_market_cap: coin.usd_market_cap,
    };
  });


const UploadSchema = z.object({
  filename: z.string().min(1).max(120),
  content_type: z.string().max(80),
  data_base64: z.string().min(1),
});

export const uploadLaunchImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UploadSchema.parse(d))
  .handler(async ({ data }) => {
    if (!data.content_type.startsWith("image/")) {
      throw new Error("Only image files allowed");
    }
    const bytes = Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("Image must be under 4MB");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = (data.filename.split(".").pop() || "png").toLowerCase().slice(0, 6);
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("launch-images")
      .upload(path, bytes, { contentType: data.content_type, upsert: false });
    if (error) throw new Error(error.message);
    return { path: `storage://${path}` };
  });

