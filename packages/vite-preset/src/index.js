import { cloudflare } from "@cloudflare/vite-plugin";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export function createAppConfig() {
	return defineConfig({
		plugins: [
			devtools({ eventBusConfig: { port: 0 } }),
			// Cloudflare Workers deploy via @cloudflare/vite-plugin (replaces the
			// Nitro cloudflare-pages preset). It supplies the SSR environment through
			// miniflare/workerd in-process, so TanStack Start's SPA shell prerender
			// runs in-process at build time — no spawned `wrangler pages dev` (which
			// broke the Pages build: Nitro passes `--host`, but `wrangler pages dev`
			// only accepts `--ip`). `cloudflare()` must precede `tanstackStart()` per
			// the Cloudflare TanStack Start guide. SPA mode (below) prerenders a
			// single static shell to `/_shell.html`; per-route `ssr: false` on both
			// layouts is kept as a fallback.
			cloudflare({
				viteEnvironment: { name: "ssr" },
				// Disable miniflare's inspector (default port 9229). `bun run build`
				// builds both apps in parallel via Turbo, and each would bind 9229 →
				// `EADDRINUSE`. The inspector is only a worker-debugging aid; the
				// build-time SPA prerender and dev server work fine without it.
				inspectorPort: false,
			}),
			tanstackStart({ spa: { enabled: true } }),
			viteReact(),
		],
		resolve: {
			tsconfigPaths: true,
		},
		optimizeDeps: {
			include: [
				"@tanstack/react-query",
				"convex/browser",
				"convex/react",
				"superjson",
			],
		},
	});
}
