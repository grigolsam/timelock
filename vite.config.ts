// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const rpcWebsocketsBrowser = fileURLToPath(
  new URL("./node_modules/rpc-websockets/dist/index.browser.mjs", import.meta.url),
);

// Several @solana/* packages ship exports maps without a `workerd` condition,
// so rolldown fails to resolve them for the Cloudflare Worker SSR build.
// Point them at the browser build (absolute path bypasses the exports map).
// Runtime usage lives in browser-only dynamic imports (see src/lib/lock-flow.ts).
const solanaBrowserAlias = (pkg: string) => ({
  find: pkg,
  replacement: fileURLToPath(
    new URL(`./node_modules/${pkg}/dist/index.browser.mjs`, import.meta.url),
  ),
});

const localBufferShim = fileURLToPath(new URL("./src/lib/buffer-polyfill.ts", import.meta.url));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      // @coral-xyz/anchor is pulled in transitively by StreamFlow/Solana.
      // In SSR it otherwise assumes Node, executes `exports.workspace = ...`,
      // and crashes the ESM Worker with `ReferenceError: exports is not defined`.
      "process.env.ANCHOR_BROWSER": JSON.stringify("true"),
    },
    optimizeDeps: {
      include: [],
    },
    resolve: {
      alias: [
        {
          find: /^buffer\/?$/,
          replacement: localBufferShim,
        },
        {
          find: "rpc-websockets",
          replacement: rpcWebsocketsBrowser,
        },
        solanaBrowserAlias("@solana/codecs"),
        solanaBrowserAlias("@solana/codecs-core"),
        solanaBrowserAlias("@solana/codecs-numbers"),
        solanaBrowserAlias("@solana/codecs-data-structures"),
        solanaBrowserAlias("@solana/codecs-strings"),
        solanaBrowserAlias("@solana/options"),
        solanaBrowserAlias("@solana/errors"),
      ],
    },
  },
});
