import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint (called every 5 min by pg_cron).
 * For each live launch:
 *   - call pumpportal collectCreatorFee via trade-local
 *   - measure wallet balance delta
 *   - add delta to pool_sol + available_sol, log to claims
 */
export const Route = createFileRoute("/api/public/hooks/claim-rewards")({
  server: {
    handlers: {
      POST: async () => {
        const { claimRewards } = await import("@/lib/claim-rewards.server");
        return claimRewards();
      },
    },
  },
});
