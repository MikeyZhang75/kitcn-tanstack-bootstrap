## Monorepo layout

Turborepo + Bun workspaces. Six workspaces matter:

- `apps/web` — TanStack Start app (Vite dev server + Nitro SSR), deployed to Cloudflare Pages (project name in `apps/web/wrangler.local.toml`) at the domain you wire through `VITE_SITE_URL`, e.g. `https://app.example.com`. Front-of-house app for end users; session gate requires `role === "user"`.
- `apps/dashboard` — Second TanStack Start app, cloned from `apps/web` to serve admin users; deployed to Cloudflare Pages (project name in `apps/dashboard/wrangler.local.toml`) at e.g. `https://dash.example.com`. Session gate requires `role === "admin"`. Currently hosts `/` (dashboard stub) and `/invitations` (invitation-code management) under `_authenticated`. Shares the same Convex backend and custom session-token auth as `apps/web`; the two differ only in which role the gate accepts and which routes render.
- `packages/backend` — Convex backend authored with **kitcn**. Exposes `@repo/backend/shared/api` to both frontend apps so each client has fully typed cRPC bindings.
- `packages/app-convex` — Shared Convex client plumbing consumed by both frontend apps as `@repo/app-convex`. Owns the cRPC provider (`crpc`), the React Query client factory (`query-client`), the error normalizer (`errors`), the Convex provider (`convex-provider`), the `localStorage` session store (`session-store`), and the auth hooks (`use-session` → `useSessionToken`/`useSession`; `use-auth` → `useSignIn`/`useSignUp`/`useSignOut`). Reads `import.meta.env.VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` directly — Vite inlines them at build time for whichever app bundles the package. There is **no per-app auth client** (Better Auth is gone); the only per-app frontend code is `app-sidebar.tsx` (nav items + title) and the `_public/auth.tsx` form (`web` has a sign-up toggle, `dashboard` is sign-in only). See [auth](auth.md).
- `packages/ui` — Shared shadcn primitives, utilities, hooks, and the Tailwind v4 globals stylesheet, consumed by both frontend apps as `@repo/ui`. Follows shadcn's [official monorepo layout](https://ui.shadcn.com/docs/monorepo) — see [UI components](ui-components.md).
- `packages/vite-preset` — Exports `createAppConfig()`, the shared Vite config (plugin stack + `optimizeDeps.include` for `convex/react`, `convex/browser`, `superjson`, `@tanstack/react-query`) consumed by both apps as `@repo/vite-preset`. Each app's `vite.config.ts` is a 3-line delegation to this factory so plugin / devtools / optimizeDeps changes happen in one place.
- `packages/typescript-config` — shared `tsconfig` presets; not code.

Root scripts run through Turbo against every workspace:

```bash
bun install                  # bun workspaces
bun run dev                  # runs `turbo dev` → web + dashboard (both portless + Vite) + backend (kitcn dev)
bun run build                # production build (also used in CI)
bun run typecheck            # turbo typecheck across workspaces — the canonical correctness gate
bun run codegen              # regenerates Convex/kitcn bindings (see below)
bun run check:fix            # oxfmt + oxlint --fix (format + lint + auto-fix)
```

Per-workspace commands when you only want to touch one side:

```bash
cd apps/web && bunx tsc --noEmit          # web-only typecheck (faster than turbo)
cd apps/web && bun run test               # vitest (jsdom); `bun run test -- <pattern>` to filter
cd packages/backend && bun run dev        # `kitcn dev` — Convex dev + codegen watcher
cd packages/backend && bun run deploy     # `kitcn deploy --yes` (prod)
```

CI (`.github/workflows/deploy.yml`) runs three quality gates in order: `bunx oxfmt --check` (format), `bunx oxlint --type-aware --max-warnings 0` (lint), then `bun run typecheck` (covers `@repo/web`, `@repo/dashboard`, and `@repo/backend`). On push to `main` it also deploys Convex via `kitcn deploy` and pushes **both apps** to Cloudflare Pages via two `wrangler-action` steps — one per `apps/web/wrangler.local.toml` and `apps/dashboard/wrangler.local.toml`. Both `wrangler.local.toml`s set the `nodejs_compat` compatibility flag required by Nitro's unenv polyfills. Each app is built with its own `VITE_SITE_URL` injected at the build step (e.g. `https://app.example.com` for web, `https://dash.example.com` for dashboard — substitute your real production domains) via `bun run build --filter=@repo/web|@repo/dashboard`. `VITE_SITE_URL` is each app's public origin, validated (and required as a URL) in `src/env.ts`; it is no longer wired to auth (Better Auth is gone) but is still baked per-app for absolute-URL needs.
