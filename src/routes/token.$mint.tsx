import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOCK_TIERS } from "@/lib/lock-tiers";
import { formatNum, formatSol, formatUsd, shortMint } from "@/lib/tokens";
import { getLaunchByMint } from "@/lib/launches.functions";
import { getWalletTokenBalance, listLocksByMint, quoteLock } from "@/lib/locks.functions";
import { useWallet } from "@/lib/wallet";
import { ensureBufferPolyfill } from "@/lib/buffer-polyfill";

export const Route = createFileRoute("/token/$mint")({
  loader: async ({ params }) => {
    const launch = await getLaunchByMint({ data: { mint: params.mint } });
    if (!launch) throw notFound();
    return { launch };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.launch;
    return {
      meta: t
        ? [
            { title: `$${t.symbol} · ${t.name} — Instalock` },
            { name: "description", content: t.description ?? "" },
          ]
        : [],
    };
  },
  component: TokenPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-xl px-4 py-24 text-center text-sm text-muted-foreground">
        {String(error?.message ?? "Failed to load token")}
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Token not found</h1>
        <Link to="/" className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 font-display text-[12px] font-bold uppercase tracking-wider text-primary-foreground">
          Back
        </Link>
      </div>
    </div>
  ),
});

type UnifiedToken = {
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  description: string;
  pool_sol: number;
  available_sol: number;
  claimed_sol: number;
  total_locked: number;
  usd_market_cap: number;
  price_sol_per_token: number;
};

function unify(launch: any): UnifiedToken {
  return {
    mint: launch.mint,
    symbol: launch.symbol,
    name: launch.name,
    image: launch.image_url ?? null,
    description: launch.description ?? "",
    pool_sol: Number(launch.pool_sol) || 0,
    available_sol: Number(launch.available_sol) || 0,
    claimed_sol: Number(launch.claimed_sol) || 0,
    total_locked: Number(launch.total_locked) || 0,
    usd_market_cap: Number(launch.usd_market_cap) || 0,
    price_sol_per_token: Number(launch.price_sol_per_token) || 0,
  };
}

function TokenPage() {
  const data = Route.useLoaderData();
  const token = unify(data.launch);
  const { pubkey, provider } = useWallet();

  const [tierIdx, setTierIdx] = useState(1);
  const [amount, setAmount] = useState<string>("0");
  const [custody, setCustody] = useState<"vault" | "streamflow">("vault");
  const tier = LOCK_TIERS[tierIdx];
  const amt = Number(amount) || 0;

  const quote = useQuery({
    queryKey: ["quote", token.mint, amt, tier.days],
    enabled: amt > 0,
    queryFn: () => quoteLock({ data: { mint: token.mint, amount: amt, tier_days: tier.days } }),
    staleTime: 30_000,
  });

  const priceSol = quote.data?.price_sol_per_token ?? 0;
  const solUsd = quote.data?.sol_usd_price ?? 0;
  const priceUsd = priceSol * solUsd;
  const lockedSol = priceSol * amt;
  const instantSol = quote.data?.instant_sol ?? 0;
  const lockedUsd = quote.data?.locked_usd ?? lockedSol * solUsd;
  const instantUsd = quote.data?.instant_usd ?? instantSol * solUsd;

  const balanceQ = useQuery({
    queryKey: ["wallet-balance", token.mint, pubkey ?? ""],
    enabled: !!pubkey,
    queryFn: () => getWalletTokenBalance({ data: { mint: token.mint, owner: pubkey! } }),
    staleTime: 15_000,
  });
  const holdings = balanceQ.data?.balance ?? 0;

  const [status, setStatus] = useState<string | null>(null);
  const lock = useMutation({
    mutationFn: async () => {
      if (!provider || !pubkey) throw new Error("Connect wallet first");
      await ensureBufferPolyfill();
      // Dynamic import: keeps @streamflow/stream (and @solana/codecs) out of the SSR bundle.
      const { runLockFlow, runVaultLockFlow } = await import("@/lib/lock-flow");
      const runner = custody === "vault" ? runVaultLockFlow : runLockFlow;
      const res = await runner({
        mint: token.mint,
        amount: amt,
        tierDays: tier.days,
        wallet: provider as any,
      });
      return res;
    },
    onSuccess: (r) => {
      setStatus(`Locked. Received ${r.instant_sol.toFixed(4)} SOL. Tx ${r.tx_payout.slice(0, 8)}…`);
      openLocks.refetch();
      quote.refetch();
    },
    onError: (e: any) => setStatus(e?.message ?? "Lock failed"),
  });

  const setPct = (p: number) => {
    const base = holdings > 0 ? holdings : (amt || 100) * 4;
    setAmount(String(Math.floor(base * (p / 100))));
  };

  const openLocks = useQuery({
    queryKey: ["locks-by-mint", token.mint, pubkey ?? ""],
    queryFn: () => listLocksByMint({ data: { mint: token.mint } }),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="mx-auto max-w-[460px] px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
        >
          ← All tokens
        </Link>

        <Tabs defaultValue="lock" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-11 bg-[#161616] border border-white/[0.06] p-1 rounded-xl">
            <TabsTrigger value="lock" className="rounded-lg font-display text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#ec4899] data-[state=active]:to-[#f472b6] data-[state=active]:text-white">⚡ Lock</TabsTrigger>
            <TabsTrigger value="pool" className="rounded-lg font-display text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#ec4899] data-[state=active]:to-[#f472b6] data-[state=active]:text-white">Pool</TabsTrigger>
            <TabsTrigger value="locks" className="rounded-lg font-display text-[11px] font-bold uppercase tracking-wider data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#ec4899] data-[state=active]:to-[#f472b6] data-[state=active]:text-white">Open locks</TabsTrigger>
          </TabsList>

          <TabsContent value="lock" className="mt-4">
            <div className="relative rounded-2xl border border-white/[0.06] bg-[#161616] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
              <div className="flex items-center justify-between text-[15px] font-semibold text-white">
                <div>
                  <span className="text-[#ec4899] font-bold">1.</span> Select <span className="font-bold">lock amount</span>
                </div>
                {pubkey && (
                  <span className="text-[11px] font-normal text-white/50">
                    Balance: <span className="text-white/80 tabular-nums">{formatNum(holdings)}</span> {token.symbol}
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-2xl bg-[#0f0f0f] px-5 pt-4 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-full bg-transparent text-4xl font-bold tabular-nums text-white focus:outline-none"
                    placeholder="0"
                  />
                  <div className="flex shrink-0 items-center gap-2 text-white">
                    <span className="text-[18px] font-bold">{token.symbol}</span>
                    <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-[12px] text-white">
                      {token.image ? <img src={token.image} alt="" className="h-full w-full object-cover" /> : (token.symbol?.[0] ?? "◎")}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    {[25, 50, 75, 100].map((p) => (
                      <button
                        key={p}
                        onClick={() => setPct(p)}
                        className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                      >
                        {p === 100 ? "MAX" : `${p}%`}
                      </button>
                    ))}
                  </div>
                  <span className="text-[12px] text-white/40">
                    Price: {priceUsd > 0 ? formatUsd(priceUsd) : priceSol > 0 ? `${priceSol.toExponential(3)} SOL` : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-6 text-[15px] font-semibold text-white">
                <span className="text-[#ec4899] font-bold">2.</span> Select <span className="font-bold">duration</span>
              </div>
              <div className="mt-3 rounded-2xl p-[1.5px] bg-[linear-gradient(135deg,#ec4899_0%,#ec4899_40%,#06b6d4_100%)]">
                <div className="rounded-[14px] bg-[#0f0f0f] px-5 pt-4 pb-3">
                  <div className="text-4xl font-bold tabular-nums text-white">{tier.days}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {LOCK_TIERS.map((t, i) => (
                      <button
                        key={t.days}
                        onClick={() => setTierIdx(i)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                          i === tierIdx ? "bg-[#ec4899] text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
                        }`}
                      >
                        {t.days}d · {t.instantPct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 text-[15px] font-semibold text-white">
                <span className="text-[#ec4899] font-bold">3.</span> Instantly <span className="font-bold">receive</span>
              </div>
              <div className="mt-3 rounded-2xl bg-black px-5 pt-4 pb-3 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.18),0_0_40px_-10px_rgba(236,72,153,0.35)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 truncate text-4xl font-bold tabular-nums text-white">
                    {instantSol.toFixed(4)}
                  </div>
                  <span className="text-[18px] font-bold text-white">SOL</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-[#ec4899]">{tier.apr.toFixed(2)}% APR</span>
                  <span className="text-white/50">Pool avail: {token.available_sol.toFixed(3)} SOL</span>
                </div>
              </div>
              {(() => {
                const gross = quote.data?.gross_sol ?? 0;
                const avail = quote.data?.available_sol ?? token.available_sol;
                const maxAmt = quote.data?.max_amount_for_available ?? 0;
                if (amt > 0 && gross > avail && avail >= 0) {
                  return (
                    <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[12px] leading-relaxed text-amber-200">
                      Pool only has <span className="font-bold">{avail.toFixed(4)} SOL</span> available, but this lock would pay out <span className="font-bold">{gross.toFixed(4)} SOL</span>. Lower amount to ≤ <span className="font-bold">{formatNum(Math.floor(maxAmt))} {token.symbol}</span>.
                    </div>
                  );
                }
                return null;
              })()}

              <div className="mt-6 text-[15px] font-semibold text-white">
                <span className="text-[#ec4899] font-bold">4.</span> Choose <span className="font-bold">custody</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCustody("vault")}
                  className={`rounded-xl border p-3 text-left transition ${
                    custody === "vault"
                      ? "border-[#ec4899] bg-[#ec4899]/10"
                      : "border-white/[0.08] bg-[#0f0f0f] hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[12px] font-bold uppercase tracking-wider text-white">Instalock</span>
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-emerald-400">No fee</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-white/60">
                    Tokens held in the pool wallet. Claim after unlock.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCustody("streamflow")}
                  className={`rounded-xl border p-3 text-left transition ${
                    custody === "streamflow"
                      ? "border-[#ec4899] bg-[#ec4899]/10"
                      : "border-white/[0.08] bg-[#0f0f0f] hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[12px] font-bold uppercase tracking-wider text-white">Streamflow</span>
                    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-400">~0.28 SOL</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-white/60">
                    Non-custodial on-chain escrow. Auto-sends tokens back at unlock.
                  </div>
                </button>
              </div>

              <p className="mt-6 text-center text-[13px] leading-relaxed text-white/80">
                Lock <span className="font-bold text-[#ec4899]">{formatNum(amt)} {token.symbol}</span> ({formatUsd(lockedUsd)}) for{" "}
                <span className="font-bold text-[#ec4899]">{tier.days} days</span>, receive{" "}
                <span className="font-bold text-[#ec4899]">{instantSol.toFixed(4)} SOL</span> ({formatUsd(instantUsd)}) instantly.
              </p>

              <button
                disabled={amt <= 0 || instantSol <= 0 || lock.isPending || !pubkey || (quote.data ? quote.data.gross_sol > quote.data.available_sol : false)}
                onClick={() => { setStatus(null); lock.mutate(); }}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ec4899] to-[#f472b6] text-[13px] font-bold uppercase tracking-wider text-white shadow-[0_0_30px_-6px_rgba(236,72,153,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/[0.06] disabled:text-white/40 disabled:shadow-none"
              >
                {!pubkey ? "Connect wallet" :
                  amt <= 0 ? "Enter amount" :
                  instantSol <= 0 ? "Insufficient liquidity" :
                  (quote.data && quote.data.gross_sol > quote.data.available_sol) ? "Amount exceeds pool" :
                  lock.isPending ? "Locking…" : "Lock tokens · get SOL →"}
              </button>

              {status && (
                <div className="mt-3 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 text-center font-mono text-[11px] text-white/80">
                  {status}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pool" className="mt-4">
            <PoolPanel token={token} />
          </TabsContent>

          <TabsContent value="locks" className="mt-4">
            <OpenLocksPanel token={token} rows={openLocks.data ?? []} loading={openLocks.isLoading} pubkey={pubkey} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PoolPanel({ token }: { token: UnifiedToken }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#161616] p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f0f0f] text-xl">
          {token.image ? <img src={token.image} alt={token.symbol} className="h-full w-full object-cover" /> : (token.symbol?.[0] ?? "◎")}
        </div>
        <div>
          <div className="font-display text-[16px] font-bold uppercase tracking-wide text-white">{token.name}</div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-white/50">
            <span>${token.symbol} · {shortMint(token.mint)}</span>
            <CopyButton text={token.mint} />
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06]">
        <Stat label="Pool balance" value={formatSol(token.pool_sol)} accent />
        <Stat label="Available SOL" value={formatSol(token.available_sol)} />
        <Stat label="Market cap" value={formatUsd(token.usd_market_cap)} />
        <Stat label="Claimed lifetime" value={formatSol(token.claimed_sol)} />
        <Stat label="Total locked" value={formatNum(token.total_locked)} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col bg-[#161616] px-4 py-3">
      <div className="font-display text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</div>
      <div className={`mt-1 font-display text-[16px] font-bold tabular-nums ${accent ? "gradient-text" : "text-white"}`}>{value}</div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      title="Copy CA"
      className="inline-flex items-center justify-center rounded p-0.5 text-white/50 transition hover:bg-white/10 hover:text-white"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
          <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}

type LockRow = Awaited<ReturnType<typeof listLocksByMint>>[number];

function OpenLocksPanel({
  token,
  rows,
  loading,
  pubkey,
}: {
  token: UnifiedToken;
  rows: LockRow[];
  loading: boolean;
  pubkey: string | null;
}) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const filtered = scope === "mine" && pubkey ? rows.filter((r) => r.user_pubkey === pubkey) : rows;
  const totalLocked = filtered.reduce((s, l) => s + Number(l.amount_tokens), 0);
  const totalReceived = filtered.reduce((s, l) => s + Number(l.instant_sol), 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#161616] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[16px] font-bold uppercase tracking-wide text-white">
            {scope === "mine" ? "My open locks" : "All open locks"}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-white/50">
            {filtered.length} · {totalReceived.toFixed(3)} SOL drawn
          </div>
        </div>
        <div className="flex h-8 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5">
          {(["mine", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={`h-full rounded-full px-3 font-display text-[10px] font-bold uppercase tracking-wider transition ${
                scope === k ? "bg-gradient-to-r from-[#ec4899] to-[#f472b6] text-white" : "text-white/60 hover:text-white"
              }`}
            >
              {k === "mine" ? "Mine" : "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06]">
        <div className="flex flex-col bg-[#0f0f0f] px-4 py-3">
          <div className="font-display text-[10px] font-bold uppercase tracking-wider text-white/50">Locked ({token.symbol})</div>
          <div className="mt-1 font-display text-[20px] font-bold tabular-nums gradient-text">{formatNum(totalLocked)}</div>
        </div>
        <div className="flex flex-col bg-[#0f0f0f] px-4 py-3">
          <div className="font-display text-[10px] font-bold uppercase tracking-wider text-white/50">SOL received</div>
          <div className="mt-1 font-display text-[20px] font-bold tabular-nums text-[#ec4899]">{totalReceived.toFixed(3)}</div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_70px] gap-3 bg-[#0f0f0f] px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-wider text-white/50">
          <span>Wallet</span>
          <span>Amount</span>
          <span>Received</span>
          <span>Unlocks in</span>
          <span className="text-right">Tx</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {loading && <div className="px-4 py-8 text-center text-[12px] text-white/50">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-white/50">
              {scope === "mine" ? (pubkey ? "You have no locks on this token." : "Connect your wallet to see your locks.") : "No open locks yet."}
            </div>
          )}
          {filtered.map((l) => {
            const unlocks = new Date(l.unlocks_at).getTime();
            const remainMs = Math.max(0, unlocks - Date.now());
            const totalMs = unlocks - new Date(l.created_at).getTime();
            const pct = totalMs > 0 ? Math.min(100, ((totalMs - remainMs) / totalMs) * 100) : 100;
            const ready = remainMs === 0;
            return (
              <div key={l.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_70px] items-center gap-3 px-4 py-3 text-[12px] hover:bg-white/[0.02]">
                <span className="font-mono text-white/80">{l.user_pubkey.slice(0, 4)}…{l.user_pubkey.slice(-4)}</span>
                <span className="font-mono tabular-nums text-white">{formatNum(Number(l.amount_tokens))}</span>
                <span className="font-mono tabular-nums text-[#ec4899]">{Number(l.instant_sol).toFixed(3)} SOL</span>
                <div className="min-w-0">
                  <div className={`font-mono text-[11px] tabular-nums ${ready ? "text-emerald-400" : "text-white"}`}>
                    {ready ? "Ready" : formatRemaining(remainMs)}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#ec4899] to-[#06b6d4]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <a
                  href={l.tx_payout ? `https://solscan.io/tx/${l.tx_payout}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-right font-mono text-[11px] text-white/50 transition hover:text-[#06b6d4]"
                >
                  {(l.tx_payout ?? "").slice(0, 4)}… ↗
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatRemaining(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
