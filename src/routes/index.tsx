import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { formatSol, formatNum, formatUsd, timeAgo, shortMint } from "@/lib/tokens";
import { listLaunches } from "@/lib/launches.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Instalock — Instant Upfront Liquidity" },
      {
        name: "description",
        content:
          "Launch tokens on pump.fun, auto-claim creator rewards into a shared lock pool, and let holders draw instant liquidity by locking.",
      },
    ],
  }),
  component: HomePage,
});

type SortKey = "new" | "pool" | "avail" | "locked";
type ViewMode = "grid" | "list";

type LaunchCard = {
  mint: string;
  symbol: string;
  name: string;
  image_url: string | null;
  created_at: string;
  pool_sol: number;
  available_sol: number;
  claimed_sol: number;
  total_locked: number;
  usd_market_cap: number;
};

function toCard(l: any): LaunchCard {
  return {
    mint: l.mint,
    symbol: l.symbol,
    name: l.name,
    image_url: l.image_url ?? null,
    created_at: l.created_at,
    pool_sol: Number(l.pool_sol) || 0,
    available_sol: Number(l.available_sol) || 0,
    claimed_sol: Number(l.claimed_sol) || 0,
    total_locked: Number(l.total_locked) || 0,
    usd_market_cap: Number(l.usd_market_cap) || 0,
  };
}

function HomePage() {
  const [sort, setSort] = useState<SortKey>("new");
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("list");

  const launches = useQuery({
    queryKey: ["launches"],
    queryFn: () => listLaunches(),
    staleTime: 15_000,
  });

  const allTokens = useMemo(() => (launches.data ?? []).map(toCard), [launches.data]);

  const totals = useMemo(
    () =>
      allTokens.reduce(
        (a, t) => ({
          pool: a.pool + t.pool_sol,
          avail: a.avail + t.available_sol,
          claimed: a.claimed + t.claimed_sol,
          locked: a.locked + t.total_locked,
        }),
        { pool: 0, avail: 0, claimed: 0, locked: 0 },
      ),
    [allTokens],
  );

  const tokens = useMemo(() => {
    const filtered = allTokens.filter(
      (t) =>
        !q ||
        t.symbol.toLowerCase().includes(q.toLowerCase()) ||
        t.name.toLowerCase().includes(q.toLowerCase()),
    );
    const sorted = [...filtered];
    if (sort === "new")
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sort === "pool") sorted.sort((a, b) => b.pool_sol - a.pool_sol);
    if (sort === "avail") sorted.sort((a, b) => b.available_sol - a.available_sol);
    if (sort === "locked") sorted.sort((a, b) => b.total_locked - a.total_locked);
    return sorted;
  }, [sort, q, allTokens]);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto w-full max-w-7xl px-4 pb-24">
        {/* CENTERED COMPACT HERO */}
        <section className="relative flex flex-col items-center py-12 text-center lg:py-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Live · auto-claim active
            </span>
          </div>

          <h1 className="max-w-3xl font-display text-[40px] font-bold uppercase leading-[0.95] tracking-tight sm:text-[56px]">
            Instant <span className="gradient-text">Upfront</span> Liquidity
          </h1>

          <p className="mt-4 font-display text-[13px] font-semibold uppercase tracking-[0.15em] text-primary">
            Lock pump.fun tokens. Receive SOL today.
          </p>

          <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
            We auto-claim creator rewards into a shared pool. Holders lock their tokens and draw instant
            SOL liquidity in return.
          </p>

          {/* Inline stat strip */}
          <div className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            <HeroStat label="Pool balance" value={formatSol(totals.pool)} tone="primary" />
            <HeroStat label="Available now" value={formatSol(totals.avail)} tone="accent" />
            <HeroStat label="Lifetime claimed" value={formatSol(totals.claimed)} />
            <HeroStat label="Pools · Locked" value={`${allTokens.length} · ${formatNum(totals.locked)}`} />
          </div>

          <a
            href="#tokens"
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-md border border-accent/60 bg-transparent px-6 font-display text-[13px] font-bold uppercase tracking-wider text-accent transition hover:bg-accent/10"
          >
            Claim your liquidity ⚡
          </a>
        </section>

        {/* CONTROLS */}
        <div
          id="tokens"
          className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center gap-2 border-y border-border bg-background/85 px-4 py-2 backdrop-blur"
        >
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 focus-within:border-primary/40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-muted-foreground shrink-0">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by symbol or name"
              className="h-full w-full bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <div className="flex h-10 items-center gap-0.5 rounded-md border border-border bg-card p-1">
            {(["new", "pool", "avail", "locked"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`h-full rounded px-2.5 font-display text-[11px] font-bold uppercase tracking-wider transition ${
                  sort === k
                    ? "bg-gradient-to-r from-[#ff2d8a] to-[#ff5fb0] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="flex h-10 items-center gap-0.5 rounded-md border border-border bg-card p-1">
            <button
              onClick={() => setView("grid")}
              title="Grid view"
              className={`grid h-full w-9 place-items-center rounded transition ${
                view === "grid" ? "bg-surface-elevated text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GridIcon />
            </button>
            <button
              onClick={() => setView("list")}
              title="List view"
              className={`grid h-full w-9 place-items-center rounded transition ${
                view === "list" ? "bg-surface-elevated text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListIcon />
            </button>
          </div>
        </div>

        {/* GRID VIEW — 4-6 columns on wide screens */}
        {view === "grid" && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tokens.map((t) => (
              <CompactCard key={t.mint} token={t} />
            ))}
            {tokens.length === 0 && <EmptyState loading={launches.isLoading} q={q} />}
          </div>
        )}

        {/* LIST VIEW — table */}
        {view === "list" && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr_1fr_1fr_auto] items-center gap-3 border-b border-border bg-surface-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground md:grid">
              <span>Token</span>
              <span className="text-right">Pool</span>
              <span className="text-right">Avail</span>
              <span className="text-right">MCap</span>
              <span className="text-right">Claimed</span>
              <span className="text-right">Locked</span>
              <span className="w-16" />
            </div>
            {tokens.map((t) => (
              <TokenRow key={t.mint} token={t} />
            ))}
            {tokens.length === 0 && <EmptyState loading={launches.isLoading} q={q} />}
          </div>
        )}
      </main>
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "accent";
}) {
  const color = tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="flex flex-col items-center bg-card px-4 py-4">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className={`mt-1 font-display text-xl font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function CompactCard({ token }: { token: LaunchCard }) {
  const createdAt = new Date(token.created_at).getTime();
  return (
    <Link
      to="/token/$mint"
      params={{ mint: token.mint }}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card/70 backdrop-blur transition hover:border-primary/50 hover:shadow-[0_0_24px_-10px_rgba(255,45,138,0.5)]"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-gradient-to-br from-primary/25 to-accent/25 opacity-40 blur-3xl transition group-hover:opacity-80" />

      <div className="relative flex items-center gap-2.5 px-3 pt-3">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-elevated text-base">
          {token.image_url ? (
            <img src={token.image_url} alt={token.symbol} className="h-full w-full object-cover" />
          ) : (
            <span>{token.symbol?.[0] ?? "◎"}</span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-[13px] font-bold uppercase leading-none tracking-wide">
              {token.name}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="text-primary">${token.symbol}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-border" />
            <span suppressHydrationWarning>{timeAgo(createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="relative mt-2.5 grid grid-cols-3 gap-px overflow-hidden border-y border-border bg-border">
        <MiniStat label="Pool" value={formatSol(token.pool_sol)} accent />
        <MiniStat label="Avail" value={formatSol(token.available_sol)} tone="accent" />
        <MiniStat label="MCap" value={formatUsd(token.usd_market_cap)} />
        <MiniStat label="Claimed" value={formatSol(token.claimed_sol)} />
        <MiniStat label="Locked" value={formatNum(token.total_locked)} />
      </div>

      <div className="relative flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          <span>Auto-claim</span>
        </div>
        <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wider text-accent transition group-hover:border-accent group-hover:bg-accent/20">
          Lock ⚡
        </span>
      </div>
    </Link>
  );
}

function MiniStat({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "accent";
}) {
  const color = accent ? "text-primary" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="flex flex-col bg-card px-2.5 py-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`mt-0.5 font-mono text-[11px] font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}

function TokenRow({ token }: { token: LaunchCard }) {
  const createdAt = new Date(token.created_at).getTime();
  return (
      <Link
        to="/token/$mint"
        params={{ mint: token.mint }}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3 py-3 transition last:border-b-0 hover:bg-surface-elevated md:grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr_1fr_1fr_auto] md:px-4"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-elevated text-base">
            {token.image_url ? (
              <img src={token.image_url} alt={token.symbol} className="h-full w-full object-cover" />
            ) : (
              <span>{token.symbol?.[0] ?? "◎"}</span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-display text-[13px] font-bold uppercase tracking-wide">
                {token.name}
              </span>
              <span className="font-mono text-[10px] text-primary">${token.symbol}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span>{shortMint(token.mint)}</span>
              <CopyButton text={token.mint} />
              <span className="h-0.5 w-0.5 rounded-full bg-border" />
              <span suppressHydrationWarning>{timeAgo(createdAt)}</span>
            </div>
          </div>
        </div>

        <RowStat value={formatSol(token.pool_sol)} label="Pool" accent />
        <RowStat value={formatSol(token.available_sol)} label="Avail" tone="accent" />
        <RowStat value={formatUsd(token.usd_market_cap)} label="MCap" />
        <RowStat value={formatSol(token.claimed_sol)} label="Claimed" />
        <RowStat value={formatNum(token.total_locked)} label="Locked" />

        <span className="ml-auto rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-accent transition group-hover:border-accent group-hover:bg-accent/20 md:ml-0">
          Lock ⚡
        </span>
      </Link>
  );
}

function RowStat({
  value,
  label,
  accent,
  tone,
}: {
  value: string;
  label: string;
  accent?: boolean;
  tone?: "accent";
}) {
  const color = accent ? "text-primary" : tone === "accent" ? "text-accent" : "text-foreground";
  return (
    <div className="hidden text-right md:block">
      <div className={`font-mono text-[12px] font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground md:hidden">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ loading, q }: { loading: boolean; q: string }) {
  return (
    <div className="col-span-full rounded-xl border border-border bg-card p-10 text-center text-xs text-muted-foreground">
      {loading ? "Loading launches…" : q ? `No tokens match "${q}"` : "No launches yet. Be the first — launch a token to seed the pool."}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      title="Copy CA"
      className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-success">
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

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
