import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import logoAsset from "@/assets/instalock-logo.png.asset.json";
import { useWallet, WALLETS } from "@/lib/wallet";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/my-locks", label: "My Locks" },
  { to: "/learn", label: "Learn" },
] as const;

function short(pk: string) {
  return pk.length > 8 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}


function ConnectButton() {
  const { pubkey, walletId, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gradient-to-r from-[#ff2d8a] to-[#ff5fb0] px-4 font-display text-[12px] font-bold uppercase tracking-wider text-white shadow-[0_0_20px_-4px_rgba(255,45,138,0.6)] transition hover:brightness-110"
      >
        {pubkey ? short(pubkey) : "Connect"}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-white/10 bg-[#161616] py-1 shadow-xl">
          {!pubkey && (
            <>
              <div className="px-3 pt-2 pb-1 font-display text-[10px] font-bold uppercase tracking-wider text-white/40">
                Select wallet
              </div>
              {WALLETS.map((w) => {
                const installed = typeof window !== "undefined" && !!w.get();
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      connect(w);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] font-medium text-white/85 transition hover:bg-white/[0.06]"
                  >
                    <span className="flex items-center gap-2">
                      <span>{w.icon}</span> {w.name}
                    </span>
                    <span className="font-mono text-[10px] text-white/40">
                      {installed ? "Detected" : "Install"}
                    </span>
                  </button>
                );
              })}
            </>
          )}
          {pubkey && (
            <>
              <div className="px-3 py-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                  {WALLETS.find((w) => w.id === walletId)?.name ?? "Wallet"}
                </div>
                <div className="mt-0.5 break-all font-mono text-[11px] text-white">{pubkey}</div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(pubkey);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[12px] text-white/80 transition hover:bg-white/[0.06]"
              >
                Copy address
              </button>
              <button
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[12px] text-[#ff5fb0] transition hover:bg-white/[0.06]"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={logoAsset.url}
              alt="Instalock"
              className="h-7 w-7 rounded-md object-contain"
            />
            <span className="font-display text-[18px] font-bold uppercase tracking-wider">
              Instalock
            </span>
          </Link>

          <a
            href="https://x.com/instalocksol"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instalock on X"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/70 transition hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.941 3H21.294L14.797 10.53L22.479 21H16.211L11.173 14.4L5.739 21H2.386L9.354 13.011L2.012 3H8.432L13.021 9.09L17.941 3ZM16.765 19.17H18.629L7.806 4.7H5.807L16.765 19.17Z" />
            </svg>
          </a>
        </div>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-foreground" }}
              inactiveProps={{ className: "text-foreground/65" }}
              className="font-display text-[13px] font-semibold uppercase tracking-wider transition hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/launch"
            className="hidden h-9 items-center rounded-md border border-border bg-card/60 px-3 font-display text-[12px] font-semibold uppercase tracking-wider text-foreground/80 transition hover:border-primary/40 hover:text-foreground sm:inline-flex"
          >
            Launch
          </Link>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
