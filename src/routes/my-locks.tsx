import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { formatNum, formatSol } from "@/lib/tokens";
import { claimVaultUnlock, listMyLocks } from "@/lib/locks.functions";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/my-locks")({
  head: () => ({
    meta: [
      { title: "My Locks — Instalock" },
      { name: "description", content: "Track your active Instalock positions across every pool." },
    ],
  }),
  component: MyLocksPage,
});

type LockStatus = "active" | "ready" | "claimed";

function MyLocksPage() {
  const { pubkey } = useWallet();

  const q = useQuery({
    queryKey: ["my-locks", pubkey ?? ""],
    enabled: !!pubkey,
    queryFn: () => listMyLocks({ data: { user_pubkey: pubkey! } }),
  });

  const claim = useMutation({
    mutationFn: (lockId: string) =>
      claimVaultUnlock({ data: { lock_id: lockId, user_pubkey: pubkey! } }),
    onSuccess: () => q.refetch(),
  });

  const rows = (q.data ?? []).map((r: any) => {
    const unlocks = new Date(r.unlocks_at).getTime();
    const now = Date.now();
    const status: LockStatus = r.status === "claimed" ? "claimed" : now >= unlocks ? "ready" : "active";
    return {
      id: r.id,
      mint: r.mint,
      symbol: r.launches?.symbol ?? "?",
      image: (r.launches?.symbol?.[0] ?? "◎"),
      amount: Number(r.amount_tokens),
      receivedSol: Number(r.instant_sol),
      apr: r.tier_days,
      custody: (r.custody ?? "streamflow") as "streamflow" | "vault",
      startedAt: new Date(r.created_at).getTime(),
      unlockAt: unlocks,
      status,
      txid: r.tx_payout ?? "",
    };
  });

  const totals = rows.reduce(
    (a, l) => ({
      received: a.received + l.receivedSol,
      locked: a.locked + l.amount,
      active: a.active + (l.status === "active" ? 1 : 0),
      ready: a.ready + (l.status === "ready" ? 1 : 0),
    }),
    { received: 0, locked: 0, active: 0, ready: 0 },
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-10 pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">
              My <span className="gradient-text">Locks</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {pubkey ? "Positions you've opened across every Instalock pool." : "Connect a wallet to view your locks."}
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex h-10 items-center rounded-md border border-accent/40 bg-accent/10 px-4 font-display text-[12px] font-bold uppercase tracking-wider text-accent transition hover:bg-accent/20"
          >
            Browse tokens ⚡
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label="Active locks" value={String(totals.active)} />
          <SummaryStat label="Ready to claim" value={String(totals.ready)} accent />
          <SummaryStat label="Tokens locked" value={formatNum(totals.locked)} />
          <SummaryStat label="SOL received" value={formatSol(totals.received)} />
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card/60">
          <div className="grid grid-cols-[70px_1.4fr_1fr_0.8fr_1.2fr_0.9fr_70px] gap-3 border-b border-border bg-background/40 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Lock</span>
            <span>Token / amount</span>
            <span>Received</span>
            <span>Tier</span>
            <span>Unlock</span>
            <span>Status</span>
            <span className="text-right">Tx</span>
          </div>
          {!pubkey && (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Connect wallet from the header to see your locks.
            </div>
          )}
          {pubkey && q.isLoading && (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading your locks…</div>
          )}
          {pubkey && !q.isLoading && rows.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              No locks yet. <Link to="/" className="text-accent underline">Browse tokens</Link> to open your first position.
            </div>
          )}
          {rows.map((l) => {
            const remaining = l.unlockAt - Date.now();
            const total = l.unlockAt - l.startedAt;
            const elapsed = Math.min(1, Math.max(0, (Date.now() - l.startedAt) / total));
            return (
              <div
                key={l.id}
                className="grid grid-cols-[70px_1.4fr_1fr_0.8fr_1.2fr_0.9fr_70px] items-center gap-3 border-b border-border/60 px-4 py-3.5 text-[12px] last:border-0 hover:bg-background/30"
              >
                <span className="font-mono text-[11px] text-muted-foreground">{l.id.slice(0, 6)}</span>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface-elevated text-base">{l.image}</div>
                  <div className="min-w-0">
                    <Link to="/token/$mint" params={{ mint: l.mint }} className="truncate font-display text-[12px] font-bold uppercase tracking-wide hover:text-accent">${l.symbol}</Link>
                    <div className="font-mono text-[10px] tabular-nums text-muted-foreground">{formatNum(l.amount)}</div>
                  </div>
                </div>
                <span className="font-mono tabular-nums">◎ {l.receivedSol.toFixed(3)}</span>
                <span className="font-mono tabular-nums text-[#ec4899]">{l.apr}d</span>
                <div className="min-w-0">
                  <div className="font-mono text-[11px] tabular-nums">{formatRemaining(remaining)}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#ec4899] to-[#06b6d4]" style={{ width: `${elapsed * 100}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={l.status} />
                  {l.status === "ready" && l.custody === "vault" && (
                    <button
                      onClick={() => claim.mutate(l.id)}
                      disabled={claim.isPending}
                      className="rounded-md bg-gradient-to-r from-[#ec4899] to-[#f472b6] px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      {claim.isPending ? "…" : "Claim"}
                    </button>
                  )}
                </div>
                <a
                  href={l.txid ? `https://solscan.io/tx/${l.txid}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-right font-mono text-[10px] text-muted-foreground hover:text-accent"
                >
                  {l.txid.slice(0, 4)}… ↗
                </a>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "Unlocked";
  const DAY = 86_400_000;
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${accent ? "gradient-text" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: LockStatus }) {
  const map = {
    active: "border-accent/40 bg-accent/10 text-accent",
    ready: "border-[#ec4899]/40 bg-[#ec4899]/10 text-[#ec4899]",
    claimed: "border-border bg-card text-muted-foreground",
  } as const;
  const label = { active: "Active", ready: "Ready", claimed: "Claimed" }[status];
  return (
    <span className={`inline-flex h-6 w-fit items-center rounded-md border px-2 font-display text-[10px] font-bold uppercase tracking-wider ${map[status]}`}>
      {label}
    </span>
  );
}
