// Solana RPC proxy — the public mainnet-beta endpoint returns 403 from browsers,
// so we forward JSON-RPC calls through the server which holds a Helius key.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/rpc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { RPC_URL } = await import("@/lib/solana.server");
        const body = await request.text();
        const res = await fetch(RPC_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        return new Response(res.body, {
          status: res.status,
          headers: { "content-type": "application/json" },
        });
      },
      GET: async () => new Response("ok"),
    },
  },
});
