import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import {
  createLaunch,
  finalizeLaunch,
  getLaunchStatus,
  uploadLaunchImage,
} from "@/lib/launches.functions";


export const Route = createFileRoute("/launch")({
  head: () => ({
    meta: [
      { title: "Launch a token — Instalock" },
      {
        name: "description",
        content:
          "Create a pump.fun token with a dedicated reward wallet. Fund the wallet, launch, then auto-claim creator rewards into the lock pool.",
      },
    ],
  }),
  component: LaunchPage,
});

type Step = "form" | "fund" | "launching" | "done" | "error";

const LAUNCH_FEE = 0.025;

function LaunchPage() {
  const createFn = useServerFn(createLaunch);
  const finalizeFn = useServerFn(finalizeLaunch);
  const statusFn = useServerFn(getLaunchStatus);

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [launchId, setLaunchId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [mint, setMint] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
  });
  const [devBuy, setDevBuy] = useState(0);

  async function onPickFile(file: File | null) {
    setErr(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setErr("Image must be under 4MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const data_base64 = btoa(bin);
      const { path } = await uploadLaunchImage({
        data: { filename: file.name, content_type: file.type, data_base64 },
      });
      setImagePath(path);
    } catch (e) {
      setErr((e as Error).message);
      setImageFile(null);
      setImagePath("");
    } finally {
      setUploading(false);
    }
  }

  async function onCreate() {
    setBusy(true);
    setErr(null);
    try {
      const r = await createFn({ data: { ...form, image_url: imagePath } });
      setLaunchId(r.id);
      setWallet(r.wallet_pubkey);
      setStep("fund");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshBalance() {
    if (!launchId) return;
    setBusy(true);
    try {
      const r = await statusFn({ data: { id: launchId } });
      setBalance(r.balance_sol);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onLaunch() {
    if (!launchId) return;
    setBusy(true);
    setErr(null);
    setStep("launching");
    try {
      const r = await finalizeFn({ data: { id: launchId, dev_buy_sol: devBuy } });
      setMint(r.mint);
      setSig(r.signature);
      setStep("done");
    } catch (e) {
      setErr((e as Error).message);
      setStep("fund");
    } finally {
      setBusy(false);
    }
  }

  const totalNeeded = devBuy + LAUNCH_FEE;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Launch a token</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          We generate a dedicated Solana wallet for your launch. Fund it, then we sign and
          broadcast the pump.fun create tx locally.
        </p>

        {err && (
          <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {err}
          </div>
        )}

        {step === "form" && (
          <div className="mt-6 space-y-4">
            <Field label="Token image">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-card transition hover:border-primary/40"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {uploading ? "Uploading…" : "Upload"}
                    </span>
                  )}
                </button>
                <div className="flex-1 text-[11px] text-muted-foreground">
                  PNG, JPG, GIF or WEBP. Max 4MB. Shown on pump.fun and Instalock.
                  {imagePath && (
                    <div className="mt-1 text-emerald-400">✓ Uploaded</div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </Field>

            <Field label="Name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Symbol">
              <input
                className={inputCls}
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Description">
              <textarea
                className={inputCls + " min-h-[80px] py-2"}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Twitter">
                <input
                  className={inputCls}
                  value={form.twitter}
                  onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                />
              </Field>
              <Field label="Telegram">
                <input
                  className={inputCls}
                  value={form.telegram}
                  onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                />
              </Field>
              <Field label="Website">
                <input
                  className={inputCls}
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Dev buy (SOL)">
              <input
                type="number"
                step="0.01"
                min={0}
                className={inputCls}
                value={devBuy}
                onChange={(e) => setDevBuy(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>

            <div className="rounded-lg border border-border bg-card/60 p-3 text-[11px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Launch fee</span>
                <span className="font-mono text-foreground">{LAUNCH_FEE.toFixed(3)} SOL</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-muted-foreground">
                <span>Dev buy</span>
                <span className="font-mono text-foreground">{devBuy.toFixed(3)} SOL</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5 text-[12px] font-semibold">
                <span>Fund wallet with</span>
                <span className="font-mono text-primary">{totalNeeded.toFixed(3)} SOL</span>
              </div>
            </div>

            <button
              disabled={busy || uploading || !form.name || !form.symbol || !imagePath}
              onClick={onCreate}
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#ff2d8a] to-[#ff5fb0] px-4 font-display text-[12px] font-bold uppercase tracking-wider text-white shadow-[0_0_24px_-6px_rgba(255,45,138,0.7)] transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Generating wallet…" : "Generate launch wallet"}
            </button>
          </div>
        )}

        {(step === "fund" || step === "launching") && wallet && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Deposit address
              </div>
              <div className="mt-1 break-all font-mono text-xs text-foreground">{wallet}</div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Balance: <span className="font-mono text-foreground">{balance.toFixed(4)} SOL</span>
                </span>
                <button
                  onClick={refreshBalance}
                  disabled={busy}
                  className="rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary/40"
                >
                  Refresh
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Send at least <span className="font-mono text-foreground">{totalNeeded.toFixed(3)} SOL</span>{" "}
              ({devBuy.toFixed(3)} dev buy + {LAUNCH_FEE.toFixed(3)} fee) to the wallet above,
              then click Launch.
            </p>

            <button
              onClick={onLaunch}
              disabled={busy || balance < totalNeeded}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gradient-to-r from-[#ff2d8a] to-[#ff5fb0] px-4 font-display text-[12px] font-bold uppercase tracking-wider text-white shadow-[0_0_24px_-6px_rgba(255,45,138,0.7)] transition hover:brightness-110 disabled:opacity-50"
            >
              {step === "launching" ? "Launching…" : "Launch on pump.fun"}
            </button>

          </div>
        )}

        {step === "done" && mint && (
          <div className="mt-6 space-y-3">
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
                Launched
              </div>
              <div className="mt-1 break-all font-mono text-xs">{mint}</div>
            </div>
            {sig && (
              <a
                href={`https://solscan.io/tx/${sig}`}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-xs text-muted-foreground underline"
              >
                tx: {sig}
              </a>
            )}
            <a
              href={`/token/${mint}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold hover:border-primary/40"
            >
              View token page
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
