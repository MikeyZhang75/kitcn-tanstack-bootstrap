import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export function createAppConfig() {
	return defineConfig({
		plugins: [
			devtools({ eventBusConfig: { port: 0 } }),
			nitro({ preset: "cloudflare-pages" }),
			tailwindcss(),
			// SPA mode: render the whole app on the client and prerender a static
			// shell to `/_shell.html`. ⚠️ Build caveat: that prerender runs the
			// `cloudflare-pages` preset's preview command (`npx wrangler pages dev`),
			// so the build needs a working wrangler/workerd and FAILS where it can't
			// boot (e.g. a CI runner / sandbox without it). The clean fix if that
			// bites is migrating the deploy to Cloudflare Workers via
			// `@cloudflare/vite-plugin` (prerender runs in-process). Per-route
			// `ssr: false` on both layouts is kept as a fallback: drop this flag and
			// the app still renders client-side with no prerender.
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
