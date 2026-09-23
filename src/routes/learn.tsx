import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";


export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — Instalock" },
      {
        name: "description",
        content:
          "Instalock turns pump.fun creator rewards into instant upfront SOL for holders. See the full flow: launch, auto-claim, lock, draw, unlock.",
      },
    ],
  }),
  component: LearnPage,
});

type Step = {
  n: string;
  tag: string;
  title: string;
  body: string;
  tone: "pink" | "cyan" | "muted" | "finale";
};

const STEPS: Step[] = [
  {
    n: "01",
    tag: "Creator",
    title: "Launch",
    body:
      "Create your pump.fun token through Instalock. We mint a dedicated reward wallet, take a 0.025 SOL launch fee, then broadcast the create tx natively.",
    tone: "pink",
  },
  {
    n: "02",
    tag: "Protocol",
    title: "Auto-claim",
    body:
      "Every drop of creator rewards is auto-claimed by the reward wallet and streamed into the token's shared lock pool — no manual claiming, no leaks.",
    tone: "cyan",
  },
  {
    n: "03",
    tag: "Holder",
    title: "Connect + lock",
    body:
      "Connect Phantom, Solflare or Backpack. Pick an amount and a duration tier. Longer locks unlock higher APR and a bigger upfront percentage.",
    tone: "pink",
  },
  {
    n: "04",
    tag: "Holder",
    title: "Instant SOL",
    body:
      "The moment your lock confirms, the pool wires SOL upfront. That's the present value of the rewards your locked tokens will accrue. Cash today.",
    tone: "cyan",
  },
  {
    n: "05",
    tag: "Protocol",
    title: "Time elapses",
    body:
      "Tokens sit safe in the on-chain lock contract. While locked, their creator rewards keep feeding the pool to back the next lockers.",
    tone: "muted",
  },
  {
    n: "06",
    tag: "Holder",
    title: "Unlock",
    body:
      "When the timer hits zero, the lock auto-settles on-chain and 100% of your tokens return. The SOL you drew upfront stays yours.",
    tone: "finale",
  },
];

const ACTORS = [
  {
    label: "Token creators",
    body:
      "A guaranteed liquidity engine attached to your launch. Lockers get paid upfront, which means stickier holders and less sell pressure.",
  },
  {
    label: "Token holders",
    body:
      "Don't wait for rewards to compound — receive SOL today against the locked future cash flow of your bag. Keep full upside at unlock.",
  },
  {
    label: "The pool",
    body:
      "Funded by auto-claimed creator rewards. Pays out upfront SOL to lockers in proportion to duration and size. Self-replenishing.",
  },
];

const ANATOMY = [
  { k: "Collateral", v: "Pump.fun tokens", tone: "text-[#ec4899]" },
  { k: "Payout engine", v: "Instant SOL", tone: "text-[#06b6d4]" },
  { k: "Duration", v: "7 — 90 days", tone: "text-white" },
  { k: "At unlock", v: "100% returned", tone: "text-emerald-400" },
  { k: "Security", v: "Non-custodial escrow", tone: "text-white" },
  { k: "Wallets", v: "Phantom · Solflare · Backpack", tone: "text-white" },
];

const FAQ = [
  {
    q: "Where does the upfront SOL come from?",
    a: "The token's shared pool. Creator rewards from every Instalock-launched token are auto-claimed into it and used to front liquidity to lockers.",
  },
  {
    q: "What happens at unlock?",
    a: "You get 100% of your locked tokens back. The SOL you received upfront stays yours — that's the trade the pool already priced in.",
  },
  {
    q: "Can I exit a lock early?",
    a: "Locks are time-locked on-chain and cannot be unwound early. Pick a duration you're comfortable with.",
  },
  {
    q: "How much SOL do I get?",
    a: "Scales with both lock size and duration. Each tier shows instant payout % and net APR before you confirm.",
  },
  {
    q: "What does launching cost?",
    a: "0.025 SOL launch fee plus an optional dev buy. We generate the wallet, you fund it, we sign and broadcast the create transaction.",
  },
  {
    q: "Are fees deducted?",
    a: "A small protocol fee is netted out of the upfront SOL payment. APR shown on each tier is already net of fees.",
  },
];

function StepNode({ step }: { step: Step }) {
  const ringHover =
    step.tone === "cyan" || step.tone === "finale"
      ? "group-hover:border-[#06b6d4]/50"
      : step.tone === "muted"
        ? "group-hover:border-white/30"
        : "group-hover:border-[#ec4899]/50";

  const ghostHover =
    step.tone === "cyan" || step.tone === "finale"
      ? "group-hover:text-[#06b6d4]/10"
      : step.tone === "muted"
        ? "group-hover:text-white/10"
        : "group-hover:text-[#ec4899]/10";

  let dot: ReactNode;
  if (step.tone === "finale") {
    dot = (
      <div className="h-4 w-4 rotate-45 rounded-sm bg-gradient-to-tr from-[#ec4899] to-[#06b6d4]" />
    );
  } else if (step.tone === "cyan") {
    dot = (
      <div className="h-3 w-3 rounded-full bg-[#06b6d4] shadow-[0_0_15px_rgba(6,182,212,0.6)]" />
    );
  } else if (step.tone === "muted") {
    dot = <div className="h-3 w-3 rounded-sm bg-[#ec4899]/50" />;
  } else {
    dot = (
      <div
        className={`h-3 w-3 rounded-full bg-[#ec4899] shadow-[0_0_15px_rgba(236,72,153,0.6)] ${
          step.n === "03" ? "animate-pulse" : ""
        }`}
      />
    );
  }

  const tagColor =
    step.tone === "cyan" || step.tone === "finale"
      ? "text-[#06b6d4]"
      : step.tone === "muted"
        ? "text-white/40"
        : "text-[#ec4899]";

  return (
    <div className="group relative">
      <div
        className={`pointer-events-none absolute -left-4 -top-7 select-none font-mono text-6xl font-black text-white/[0.05] transition-colors ${ghostHover}`}
      >
        {step.n}
      </div>
      <div className="space-y-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0f0f0f] transition-all ${ringHover}`}
        >
          {dot}
        </div>
        <div className="space-y-2">
          <div className={`font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${tagColor}`}>
            {step.tag}
          </div>
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-white">
            {step.title}
          </h3>
          <p className="font-mono text-[11px] uppercase leading-relaxed text-white/55">
            {step.body}
          </p>
        </div>
      </div>
    </div>
  );
}

function LearnPage() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-6 py-16 pb-28 lg:px-12">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="border border-[#ec4899]/30 bg-[#ec4899]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-tighter text-[#ec4899]">
              Protocol documentation
            </span>
            <div className="h-px flex-grow bg-gradient-to-r from-[#ec4899]/50 to-transparent" />
          </div>
          <h1 className="font-display text-5xl font-extrabold uppercase italic tracking-tight md:text-7xl">
            How{" "}
            <span className="bg-gradient-to-r from-[#ec4899] to-[#06b6d4] bg-clip-text text-transparent">
              Instalock
            </span>{" "}
            works
          </h1>
          <p className="max-w-2xl text-[14px] leading-relaxed text-white/55">
            Lock pump.fun tokens, draw SOL today, get tokens back at unlock. Below is the full
            on-chain lifecycle — six phases from genesis to settlement.
          </p>
        </div>

        {/* 6-Step Flow Pipeline */}
        <section className="relative mt-24">
          {/* Animated traveling-light pipeline line */}
          <div className="absolute left-0 top-[5.5rem] hidden h-[2px] w-full overflow-hidden bg-white/[0.06] lg:block">
            <div className="learn-scroll h-full w-48 bg-gradient-to-r from-transparent via-[#06b6d4] to-transparent" />
          </div>

          <div className="relative z-10 grid grid-cols-1 gap-x-12 gap-y-20 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => (
              <StepNode key={s.n} step={s} />
            ))}
          </div>
        </section>

        {/* Actors */}
        <section className="mt-28 border-t border-white/5 pt-12">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            Network actors
          </h4>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {ACTORS.map((a) => (
              <div
                key={a.label}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-colors hover:border-[#ec4899]/40"
              >
                <div className="font-display text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-[#ec4899] to-[#06b6d4] bg-clip-text text-transparent">
                  {a.label}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">{a.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Anatomy + FAQ grid */}
        <section className="mt-12 grid grid-cols-1 gap-12 border-t border-white/5 pt-12 md:grid-cols-2">
          <div className="space-y-6">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              Internal logic
            </h4>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-lg font-bold uppercase italic">
                  Anatomy of a lock
                </h3>
                <span className="font-mono text-[10px] text-white/35">ver 1.0</span>
              </div>
              <div className="space-y-1">
                {ANATOMY.map((row, i) => (
                  <div
                    key={row.k}
                    className={`flex items-center justify-between py-2 font-mono text-[11px] ${
                      i < ANATOMY.length - 1 ? "border-b border-white/5" : ""
                    }`}
                  >
                    <span className="uppercase text-white/45">{row.k}</span>
                    <span className={`uppercase ${row.tone}`}>{row.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h4 className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              Common queries
            </h4>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group cursor-pointer">
                  <summary className="flex list-none items-center justify-between border-b border-white/10 py-3">
                    <span className="text-[13px] font-bold uppercase tracking-tight text-white">
                      {f.q}
                    </span>
                    <span className="text-[#ec4899] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pt-3 font-mono text-[11px] leading-relaxed text-white/55">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <Link
                to="/"
                className="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] font-display text-[12px] font-bold uppercase tracking-widest text-white/80 transition hover:border-[#06b6d4]/50 hover:text-white"
              >
                Browse pools
              </Link>
              <Link
                to="/launch"
                className="inline-flex h-12 items-center justify-center rounded-md bg-gradient-to-r from-[#ec4899] to-[#06b6d4] font-display text-[12px] font-black uppercase tracking-widest text-black transition hover:scale-[1.02] active:scale-[0.98]"
              >
                Launch app
              </Link>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        @keyframes learn-scroll {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(600%); }
        }
        .learn-scroll {
          animation: learn-scroll 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
