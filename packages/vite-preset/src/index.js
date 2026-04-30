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
			tanstackStart(),
			viteReact(),
		],
		resolve: {
			tsconfigPaths: true,
		},
		optimizeDeps: {
			include: [
				"@tanstack/react-query",
				"better-auth/react",
				"convex/browser",
				"convex/react",
				"superjson",
			],
		},
	});
}
