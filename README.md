# kitcn-tanstack-bootstrap

A Bun + Turborepo monorepo template for shipping production apps on **TanStack Start + Convex (via [kitcn](https://kitcn.dev)) + Better Auth**, with a separate front-of-house app and admin dashboard sharing the same backend and design system.

## Stack

| Layer    | What it uses                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Runtime  | Bun 1.3.11, Turborepo 2.9                                                                                                         |
| Frontend | TanStack Start (Vite + Nitro SSR), TanStack Router, TanStack Query                                                                |
| Backend  | Convex with [kitcn](https://kitcn.dev) procedure builders + ORM                                                                   |
| Auth     | [Better Auth](https://www.better-auth.com) (JWT `role` claim, server-authoritative session gate)                                  |
| UI       | shadcn (base-ui variant) under `@repo/ui`                                                                                         |
| Tooling  | [oxc](https://oxc.rs) (`oxfmt` + `oxlint --type-aware`), [portless](https://github.com/nicepkg/portless) named-localhost dev URLs |
| Deploy   | Cloudflare Pages (per-app `wrangler.local.toml`)                                                                                  |

Two apps share the backend:

- **`apps/web`** — front-of-house, gates `role === "user"`
- **`apps/dashboard`** — admin, gates `role === "admin"`

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3.11 (required — `packageManager` is pinned)
- [portless](https://github.com/nicepkg/portless) — `npm i -g portless`
- A [Convex](https://convex.dev) account
- (production) A [Cloudflare Pages](https://pages.cloudflare.com) account, `wrangler` CLI

## Setup

### 1. Clone and install

```bash
git clone git@github.com:MikeyZhang75/kitcn-tanstack-bootstrap.git my-app
cd my-app
bun install
```

### 2. Provision your Convex deployment

```bash
cd packages/backend
bunx convex dev --once
```

This walks you through Convex login + project creation and writes `CONVEX_DEPLOYMENT` + `CONVEX_URL` to `packages/backend/.env.local`. Note the deployment URL; you'll wire it into the frontend next.

### 3. Set Convex runtime env vars

These are read by `getEnv()` inside Convex functions (`packages/backend/convex/lib/get-env.ts`) at runtime, so they live on the deployment, not in a local file:

```bash
# from packages/backend/
bunx convex env set DEPLOY_ENV development
bunx convex env set SITE_URLS "https://web.localhost,https://dashboard.localhost"
bunx convex env set BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
bunx convex env set JWKS "<paste output of generated JWKS>"
```

For `JWKS`, follow Better Auth's [JWT plugin docs](https://www.better-auth.com/docs/plugins/jwt) to generate a signing keyset, then paste the JSON string.

### 4. Configure frontend env files

Create `apps/web/.env.local`:

```ini
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_SITE_URL=https://web.localhost
```

Create `apps/dashboard/.env.local` (same `VITE_CONVEX_*` values, different `VITE_SITE_URL`):

```ini
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_SITE_URL=https://dashboard.localhost
```

### 5. Start the portless proxy

portless routes `*.localhost` HTTPS through a daemon on port 443. It needs sudo once per machine boot — `bun dev` will register routes automatically but the proxy itself doesn't auto-start without elevation:

```bash
sudo portless proxy start
```

The proxy generates a local CA on first run and adds it to your system trust store, so no browser warnings. See [docs/dev-environment.md](docs/dev-environment.md) for details.

### 6. Run dev

From the repo root:

```bash
bun run dev
```

This launches three Turbo tasks in parallel:

- `apps/web` → https://web.localhost
- `apps/dashboard` → https://dashboard.localhost
- `packages/backend` → `kitcn dev` (Convex dev + codegen watcher)

### 7. Bootstrap the first admin

Signups always land as `role: "user"`, so the dashboard (`role === "admin"`) has no client signup path on a fresh deployment. Use the cold-start mutation once:

```bash
cd packages/backend
bunx convex run users:bootstrapAdmin '{"username":"admin","password":"<your-password>"}'
```

Then sign in at https://dashboard.localhost. The session JWT carries `role: "admin"` from the first session. See [docs/auth.md](docs/auth.md#cold-start-minting-the-first-admin) for prod variants and the safety net (refuses to run if any admin already exists).

## Common scripts

| Command             | What it does                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `bun run dev`       | Run all dev servers (web + dashboard + backend codegen watcher)                            |
| `bun run build`     | Production build of both apps                                                              |
| `bun run typecheck` | Type-check across all workspaces — the canonical correctness gate                          |
| `bun run check:fix` | Format with `oxfmt` + lint with `oxlint --type-aware --fix`                                |
| `bun run codegen`   | Regenerate kitcn / Convex bindings (run after editing `convex/functions/*` or `schema.ts`) |

Backend-only:

```bash
cd packages/backend
bun run dev      # kitcn dev (Convex + codegen watcher)
bun run deploy   # kitcn deploy --yes (prod)
```

## Adding shadcn components

Run the shadcn CLI from inside either app — the CLI reads the app's `components.json` and writes new primitives into `packages/ui/src/components/` automatically:

```bash
cd apps/web
bunx shadcn@latest add button
```

Import primitives from the shared `@repo/ui` workspace:

```tsx
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
```

First-party wrappers (DataTable, LoadingButton, NavUser) live under `@repo/ui/components/custom-ui/` — see [docs/ui-components.md](docs/ui-components.md).

## Production deployment

CI deploys on push to `main` (when the workflow is wired up):

1. Convex via `kitcn deploy`.
2. Both apps to Cloudflare Pages — one `wrangler-action` step per `apps/web/wrangler.local.toml` and `apps/dashboard/wrangler.local.toml`.

Each app's `VITE_SITE_URL` must be baked in at build time to match its production domain (Better Auth uses it as the SSR `baseURL`):

```bash
bun run build --filter=@repo/web        # with VITE_SITE_URL=https://app.example.com
bun run build --filter=@repo/dashboard  # with VITE_SITE_URL=https://dash.example.com
```

For schema changes that need a backfill (e.g. adding a `.notNull()` column), follow [docs/MIGRATION.md](docs/MIGRATION.md) — never deploy a `.notNull()` column before existing rows have the value set.

## Documentation

- [Monorepo layout](docs/monorepo-layout.md) — workspaces, root scripts, deploy pipeline
- [Backend architecture](docs/backend-architecture.md) — kitcn procedure builders, `{ code, message, data? }` cRPC envelope
- [Auth flow](docs/auth.md) — Better Auth + JWT role claim, session gate, cold-start admin
- [Frontend architecture](docs/frontend-architecture.md) — TanStack Router layouts, FSD-style slices
- [UI components](docs/ui-components.md) — shadcn (base-ui variant) and `@repo/ui/custom-ui/`
- [Invitations feature](docs/feature-invitations.md) — admin-minted signup codes, state machine
- [Conventions](docs/conventions.md) — `useReducer` rule, shared-schema-per-procedure, kitcn target asymmetry
- [Dev environment](docs/dev-environment.md) — portless setup, Conductor symlinks
- [Migration guide](docs/MIGRATION.md) — Convex schema changes with backfill workflow
- [kitcn CLI guide](docs/kitcn-cli-guide.md) — `deploy` / `migrate` / `aggregate` target asymmetry
- [Version bumps](docs/version-bumps.md) — append-only log + bump procedure with subagent fan-out

## License

MIT.
