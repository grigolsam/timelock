// Shared client + server tier config. Placeholder rates — subject to change.
export type LockTierDef = {
  days: number;
  label: string;
  instantPct: number; // % of locked-token SOL value paid instantly from available_sol
  apr: number;
};

export const LOCK_TIERS: LockTierDef[] = [
  { days: 7, label: "7 days", instantPct: 10, apr: 42 },
  { days: 30, label: "30 days", instantPct: 40, apr: 96 },
  { days: 90, label: "90 days", instantPct: 70, apr: 184 },
  { days: 180, label: "180 days", instantPct: 100, apr: 264 },
];

export function tierByDays(days: number): LockTierDef | undefined {
  return LOCK_TIERS.find((t) => t.days === days);
}
