# Version bump log

Append a row whenever a direct dependency version is bumped. Peer/transitive
updates don't need entries.

## How to bump

Follow this procedure for every bump, including "just a patch". Skipping
steps is how a "safe" patch quietly breaks SSR or the type-check.

### 1. Audit what's outdated

```bash
bun outdated --filter '*'
```

Rows where `Current == Update` but `Latest` is newer mean the
`package.json` pin is blocking the bump — the pin itself has to be
edited, not just the lockfile.

### 2. Categorize by risk

- **low** — patches, stable-major minors (react-query 5.x, recharts 3.x), dev-only devtools.
- **medium** — minor bumps on auth/storage surfaces (`better-auth`), pre-1.0 minors, test-env bumps (`jsdom`), kitcn-adjacent tooling.
- **high** — majors (`typescript`, `vite`, `vitest`) or anything that forces a coordinated multi-package bump.

Add a row to the Pending table below with the risk tag and a one-line
note on what to watch for.

### 3. Per-package investigation — fan out to subagents

Changelog reads and impact verification are embarrassingly parallel —
one package has nothing to say about another. **Spawn one subagent per
package in a single message** (multiple `Agent` tool calls in the same
response) so they execute concurrently. A serial pass through 6
packages is 6× slower than it needs to be.

Use `subagent_type: "general-purpose"` and give each agent a
self-contained prompt that:

1. Names one package and its version delta (`from` → `to`).
2. Instructs it to fetch **every** intermediate changelog:
   - `gh release view <tag> --repo <owner>/<repo> --json body -q '.body'` for GitHub-hosted projects.
   - WebFetch otherwise.
   - For multi-minor spans (e.g. `0.7.11 → 0.10.2`), read each `.0` minor plus the target patch.
   - For monorepo releases (TanStack/query, TanStack/devtools), fetch the **per-package** tag — the top-level release is usually just a bundler that won't list the real changes.
3. Instructs it to verify impact by greping the actual source for each removed/renamed API:

   ```bash
   grep -rn "<removed-api>" apps/web/src packages/backend/convex
   ```

4. Asks for a short verdict: `safe | needs-code-change | blocked` plus a one-line rationale, the CVE/GHSA list if security-related, and any new config fields worth knowing.

Example fanout (do this in a single message with N `Agent` calls):

```text
Agent 1 → "Investigate hono 4.12.9 → 4.12.14 for @repo/backend…"
Agent 2 → "Investigate recharts 3.8.0 → 3.8.1 for @repo/web…"
Agent 3 → "Investigate @tanstack/react-query 5.95.2 → 5.99.0…"
…
```

Aggregate their verdicts back into a summary table before touching any
`package.json`. If any agent returns `needs-code-change`, do the fix
in the same commit as the bump; if `blocked`, leave the row in Pending
with an updated note explaining why.

For packages that are a direct dep but not imported in source (e.g.
`@opentelemetry/api` — ambient peer), the agent should flag that
explicitly; the bump is trivially safe. For security-driven bumps
(e.g. `hono` 4.12.12 GHSAs) the CVE list goes in the commit body
regardless of whether the affected middleware is used.

**Always check adapter / integration peer ranges**, not just the
package's own changelog. A package can be self-consistent across a
major bump and still break because a downstream adapter pins a
narrower peer range. Before bumping any package that has a dedicated
adapter (Convex, Drizzle, Prisma, Next.js, etc.), run:

```bash
bun pm view <adapter-package> peerDependencies
bun pm view <adapter-package> dist-tags
```

and verify the adapter's declared range **includes** the target
version. This is how the `better-auth` 1.5.3 → 1.6.5 attempt landed
on `main` and had to be reverted in `170a92a` — the core changelog
was clean, but `@convex-dev/better-auth@0.11.4` declared
`better-auth: ">=1.5.0 <1.6.0"`, and bun installed the bump anyway
(peer mismatches are warnings, not errors). The agent prompt for any
adapter-backed package must include "also fetch the adapter's peer
range and confirm the target version satisfies it."

### 4. Edit the pin

Match the existing pin style in each workspace's `package.json`:

- Exact (e.g. `"1.33.0"`) stays exact — overwrite with the new exact version.
- Caret (e.g. `"^0.7.0"`) stays caret — update the floor when crossing a minor/major. Pre-1.0 carets only allow the same minor (`^0.7.0` will not pick up `0.10.x`).

**Never run `bun update <pkg>` from the repo root.** Bun treats the
root as a workspace and, when the package isn't declared there, adds
a stray root-level `dependencies` entry instead of updating the real
workspace pin. If you need to use `bun update`, run it inside the
workspace directory.

### 5. Install + verify (all must pass)

```bash
bun install
bun run check:fix     # oxfmt + oxlint --type-aware --fix
bun run typecheck     # canonical correctness gate (both workspaces)
bun run build         # catches SSR / bundler regressions
```

CI runs `bunx oxfmt --check` + `bunx oxlint --type-aware --max-warnings 0` + `bun run typecheck`,
so local green on those three plus a successful build is a strong signal.

### 6. Commit in two passes

Keeps the log honest and the deps PR reviewable on its own.

1. **Deps commit**: `chore(deps): bump <pkg> from <from> to <to>` (batch multiple coordinated bumps into one commit with a bullet list in the body). Stages `apps/*/package.json`, `packages/*/package.json`, and `bun.lock`.
2. **Log commit**: `docs: log <what> in version-bumps.md` — moves rows from Pending to Completed and references the deps commit's short SHA.

For majors, mention the coordinated packages in the body and add a
test plan if the surface area is non-trivial.

### 7. Repo-specific gotchas

- **Markdown table alignment**: oxfmt and the IDE's markdownlint disagree on unicode width for `≥` and `—`. Trust oxfmt — CI runs `oxfmt --check`, not markdownlint.
- **Backend has no `build` step** — `bun run build` only builds `@repo/web`. For backend changes, the meaningful gate is `bun run typecheck` + a `bunx kitcn deploy --dry-run` if you're paranoid.
- **`apps/web/src/routes/__root.tsx` stale-chunk self-heal** depends on Vite's `vite:preloadError`. Any major Vite bump requires manually verifying that listener still fires after a production deploy — don't just rely on unit tests.
- **kitcn-adjacent bumps** (kitcn itself, `convex`, `better-auth`) — read `docs/kitcn-cli-guide.md` and `docs/MIGRATION.md` first, and never run `bunx kitcn aggregate <subcmd>` without `--prod` when you mean prod.

## Completed

| Date       | Package                    | From     | To       | Scope                                   | Commit    |
| ---------- | -------------------------- | -------- | -------- | --------------------------------------- | --------- |
| 2026-04-17 | `convex`                   | 1.33.0   | 1.35.1   | `@repo/web`, `@repo/backend`            | `fd8c94d` |
| 2026-04-17 | `shadcn`                   | 4.2.0    | 4.3.0    | `@repo/web`                             | `9aead35` |
| 2026-04-17 | `oxlint-tsgolint`          | 0.21.0   | 0.21.1   | root                                    | `9aead35` |
| 2026-04-17 | `@opentelemetry/api`       | 1.9.0    | 1.9.1    | `@repo/web`                             | `b88d364` |
| 2026-04-17 | `hono`                     | 4.12.9   | 4.12.14  | `@repo/backend`                         | `b88d364` |
| 2026-04-17 | `recharts`                 | 3.8.0    | 3.8.1    | `@repo/web`                             | `b88d364` |
| 2026-04-17 | `@tanstack/react-query`    | 5.95.2   | 5.99.0   | `@repo/web`                             | `b88d364` |
| 2026-04-17 | `@tanstack/react-devtools` | 0.7.11   | 0.10.2   | `@repo/web`                             | `b88d364` |
| 2026-04-17 | `@types/node`              | 22.19.17 | 25.6.0   | `@repo/web`                             | `b88d364` |
| 2026-04-17 | `jsdom`                    | 27.4.0   | 29.0.2   | `@repo/web`                             | `6435cfa` |
| 2026-04-17 | `@tanstack/devtools-vite`  | 0.3.12   | 0.6.0    | `@repo/web`                             | `6435cfa` |
| 2026-04-17 | `vite-tsconfig-paths`      | 5.1.4    | 6.1.1    | `@repo/web`                             | `6435cfa` |
| 2026-04-17 | `vite`                     | 7.3.2    | 8.0.8    | `@repo/web`                             | `c98100c` |
| 2026-04-17 | `vitest`                   | 3.2.4    | 4.1.4    | `@repo/web`                             | `c98100c` |
| 2026-04-17 | `@vitejs/plugin-react`     | 5.2.0    | 6.0.1    | `@repo/web`                             | `c98100c` |
| 2026-04-18 | `kitcn`                    | 0.12.27  | 0.13.2   | all four workspaces                     | `4815fb5` |
| 2026-04-18 | `better-auth`              | 1.5.3    | 1.6.5    | all four workspaces                     | `4815fb5` |
| 2026-04-20 | `kitcn`                    | 0.13.2   | 0.13.4   | all four workspaces                     | `c4f2a66` |
| 2026-04-30 | `kitcn`                    | 0.13.4   | 0.14.2   | all four workspaces                     | `0374c9c` |
| 2026-04-30 | `convex`                   | 1.35.1   | 1.36.1   | all four workspaces                     | `0374c9c` |
| 2026-04-30 | `better-auth`              | 1.6.5    | 1.6.9    | all four workspaces                     | `0374c9c` |
| 2026-04-30 | `@tanstack/react-query`    | 5.99.0   | 5.100.6  | web, dashboard, app-convex              | `0374c9c` |
| 2026-04-30 | `hono`                     | 4.12.14  | 4.12.16  | `@repo/backend`                         | `0374c9c` |
| 2026-04-30 | `oxfmt`                    | 0.45.0   | 0.47.0   | root                                    | `0374c9c` |
| 2026-04-30 | `oxlint-tsgolint`          | 0.21.1   | 0.22.1   | root                                    | `0374c9c` |
| 2026-05-05 | `@tanstack/react-query`    | 5.100.6  | 5.100.9  | web, dashboard, app-convex              | `51f3644` |
| 2026-05-05 | `@tanstack/react-router`   | 1.168.26 | 1.169.1  | web, dashboard                          | `51f3644` |
| 2026-05-05 | `@tanstack/react-start`    | 1.167.52 | 1.167.62 | web, dashboard, app-convex, vite-preset | `51f3644` |
| 2026-05-05 | `@tanstack/router-plugin`  | 1.167.29 | 1.167.32 | web, dashboard                          | `51f3644` |
| 2026-05-05 | `convex`                   | 1.36.1   | 1.37.0   | all four workspaces                     | `51f3644` |
| 2026-05-05 | `zod`                      | 4.4.1    | 4.4.3    | web, dashboard, backend                 | `51f3644` |
| 2026-05-05 | `react-resizable-panels`   | 4.10.0   | 4.11.0   | `@repo/ui`                              | `51f3644` |
| 2026-05-05 | `turbo`                    | 2.9.6    | 2.9.8    | root                                    | `51f3644` |
| 2026-07-26 | `kitcn`                    | 0.14.2   | 0.15.17  | all four workspaces                     | `275e3bd` |
| 2026-07-26 | `convex`                   | 1.37.0   | 1.42.3   | all four workspaces                     | `275e3bd` |
| 2026-07-26 | `react-day-picker`         | 9.14.0   | 10.0.1   | `@repo/ui`                              | `d33a66c` |
| 2026-07-26 | `@shadcn/react`            | —        | 0.2.1    | `@repo/ui` (new dep)                    | `d33a66c` |
| 2026-07-26 | `vaul`                     | 1.1.2    | —        | `@repo/ui` (removed)                    | `d33a66c` |
| 2026-07-26 | `hono`                     | 4.12.16  | 4.12.32  | `@repo/backend`                         | `33f3a3f` |
| 2026-07-26 | `typescript`               | 5.9.3    | 6.0.3    | all six workspaces                      | `33f3a3f` |
| 2026-07-26 | `@tanstack/react-router`   | 1.169.1  | 1.170.18 | web, dashboard                          | `33f3a3f` |
| 2026-07-26 | `@tanstack/react-start`    | 1.167.62 | 1.168.32 | web, dashboard, app-convex, vite-preset | `33f3a3f` |
| 2026-07-26 | `@tanstack/router-plugin`  | 1.167.32 | 1.168.23 | web, dashboard                          | `33f3a3f` |
| 2026-07-26 | `@tanstack/react-query`    | 5.100.9  | 5.101.4  | web, dashboard, app-convex              | `33f3a3f` |
| 2026-07-26 | `@tanstack/devtools-vite`  | 0.6.0    | 0.8.3    | `@repo/vite-preset`                     | `33f3a3f` |
| 2026-07-26 | `vite`                     | 8.0.10   | 8.1.5    | web, dashboard, vite-preset             | `33f3a3f` |
| 2026-07-26 | `vitest`                   | 4.1.5    | 4.1.10   | web, dashboard                          | `33f3a3f` |
| 2026-07-26 | `@cloudflare/vite-plugin`  | 1.39.0   | 1.47.0   | `@repo/vite-preset`                     | `33f3a3f` |
| 2026-07-26 | `wrangler`                 | 4.95.0   | 4.114.0  | `@repo/vite-preset`                     | `33f3a3f` |
| 2026-07-26 | `turbo`                    | 2.9.8    | 2.10.6   | root                                    | `33f3a3f` |
| 2026-07-26 | `oxfmt`                    | 0.47.0   | 0.60.0   | root                                    | `33f3a3f` |
| 2026-07-26 | `oxlint`                   | 1.62.0   | 1.75.0   | root                                    | `33f3a3f` |
| 2026-07-26 | `oxlint-tsgolint`          | 0.22.1   | 7.0.2001 | root                                    | `33f3a3f` |
| 2026-07-26 | `@base-ui/react`           | 1.4.1    | 1.6.0    | `@repo/ui`                              | `33f3a3f` |
| 2026-07-26 | `tailwindcss`              | 4.2.4    | 4.3.3    | web, dashboard, ui, vite-preset         | `33f3a3f` |
| 2026-07-26 | `shadcn`                   | 4.6.0    | 4.15.0   | `@repo/ui`                              | `33f3a3f` |
| 2026-07-26 | `recharts`                 | 3.8.1    | 3.10.1   | `@repo/ui`                              | `33f3a3f` |
| 2026-07-26 | `lucide-react`             | 1.14.0   | 1.27.0   | web, dashboard, ui                      | `33f3a3f` |
| 2026-07-26 | `react` + `react-dom`      | 19.2.5   | 19.2.8   | web, dashboard, ui, app-convex          | `33f3a3f` |
| 2026-07-26 | `@types/node`              | 25.6.0   | 26.1.1   | web, dashboard, app-convex              | `33f3a3f` |
| 2026-08-17 | `kitcn`                    | 0.15.17  | 0.17.4   | all four workspaces                     | `abcd641` |
| 2026-08-17 | `convex`                   | 1.42.3   | 1.44.0   | all four workspaces                     | `abcd641` |
| 2026-08-17 | `antd`                     | —        | 6.6.0    | web, dashboard (new dep)                | —         |
| 2026-08-17 | `@ant-design/icons`        | —        | 6.3.2    | web, dashboard (new dep)                | —         |
| 2026-08-17 | `@repo/ui` (whole package) | —        | —        | deleted                                 | —         |
| 2026-08-17 | `tailwindcss`              | 4.3.3    | —        | web, dashboard (removed)                | —         |
| 2026-08-17 | `@tailwindcss/vite`        | 4.3.3    | —        | `@repo/vite-preset` (removed)           | —         |
| 2026-08-17 | `lucide-react`             | 1.27.0   | —        | web, dashboard (removed)                | —         |
| 2026-08-17 | `sonner`                   | 2.0.7    | —        | web, dashboard (removed)                | —         |
| 2026-08-17 | `@tanstack/react-table`    | 8.21.3   | —        | web, dashboard (removed)                | —         |
| 2026-08-17 | `kitcn`                    | 0.17.4   | 0.25.1   | all four workspaces                     | `8f9beee` |

Two unrelated things landed on 2026-08-17. The `kitcn` / `convex` rows
(`abcd641`) are a routine coupled bump — notes for those are in the section
below. Everything from `antd` down is the **shadcn → Ant Design migration**,
which is not a bump at all: `packages/ui` was deleted outright and both apps
now depend on `antd` + `@ant-design/icons` directly. That also dropped every
dependency that only existed to serve shadcn primitives (`@base-ui/react`,
`@shadcn/react`, `shadcn`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `tw-animate-css`, `cmdk`, `date-fns`,
`embla-carousel-react`, `input-otp`, `next-themes`, `react-day-picker`,
`react-resizable-panels`, `recharts`, `@fontsource-variable/geist`) — they
went with the package, so they get no individual rows. Notes for future bumps:

- **`antd` and `@ant-design/icons` move together.** antd 6 requires icons >= 6,
  and icons 6 is not compatible with antd 5. Bump both in the same commit.
- **`@ant-design/v5-patch-for-react-19` is not needed.** antd 6 supports React
  19 natively; adding the shim would be a regression.
- Every `@repo/ui`-scoped row above this point is **historical** — that
  workspace no longer exists. Don't try to "fix" those rows.

The three `@repo/ui` rows tagged `d33a66c` came from a `shadcn` registry
refresh, not a manual audit — the CLI rewrites `packages/ui/package.json` pins
as a side effect of regenerating components (see
[ui-components.md](ui-components.md)). Notes:

- `react-day-picker` 9 → 10: the base-nova `calendar` registry item asks for
  `react-day-picker@latest`, so the major floated in. v10 drops the
  deprecated classname-alias layer (the CLI renamed `calendar.tsx`'s `table`
  key to `month_grid`) and the non-Gregorian subpaths, which removed the
  `@tabby_ai/hijri-converter` and `date-fns-jalali` transitives from the
  lockfile. Neither app imports `calendar.tsx`, so there is no runtime
  exposure today. The audit behind `33f3a3f` reached the same rename
  independently, so the two landed identical `calendar.tsx` edits.
- `vaul` removed because `drawer.tsx` was rewritten onto
  `@base-ui/react/drawer`; nothing in the repo imports `vaul` anymore.
- `recharts` was held at 3.8.1 by `d33a66c`, because the `chart` registry item
  hard-pins 3.8.0 and would have reverted the 3.8.1 bump logged under
  `b88d364`. `33f3a3f` then bumped it forward to 3.10.1 on the strength of a
  changelog audit — hence the row above. Re-running `shadcn add chart` will
  try to drag it back to 3.8.0 again; restore the pin afterwards.

Smaller same-range refreshes in the same commit: `@tanstack/react-devtools`
0.10.2 → 0.10.9, `@tanstack/react-router-devtools` 1.166.13 → 1.167.0,
`@tanstack/react-router-ssr-query` 1.166.12 → 1.167.1, `@vitejs/plugin-react`
6.0.1 → 6.0.4, `react-resizable-panels` 4.11.0 → 4.12.2, `date-fns` 4.1.0 →
4.4.0, `tailwind-merge` 3.5.0 → 3.6.0, `@fontsource-variable/geist` 5.2.8 →
5.3.0, `@types/react` 19.2.14 → 19.2.17, `@faker-js/faker` 10.4.0 → 10.5.0.

### Gotchas found in the 2026-07-26 audit

- **`kitcn` ⇄ `convex` are now coupled.** kitcn 0.15.0 raised its `convex`
  peer floor from `>=1.36` to `>=1.38`, so the two must move in the same
  commit. Enforcement is warning-only (bun treats peer mismatches as
  warnings), which makes it easy to miss.
- **`typescript` was never actually blocked by kitcn.** The old Pending note
  claimed kitcn's exact `typescript: "5.9.3"` pin blocked TS 6. It doesn't:
  that's a `dependencies` entry, not a peer, so bun's isolated linker gives
  kitcn its own private copy. Verified post-bump — kitcn resolves 5.9.3
  while all six workspaces resolve 6.0.3, side by side. Check _how_ a pin is
  declared before recording it as a blocker.
- **`@tanstack/devtools-vite` 0.7.x is a trap.** 0.7.0/0.7.1 emit
  syntactically invalid code when stripping this repo's
  `{import.meta.env.DEV && (<TanStackDevtools/>)}`, breaking `vite build`.
  Never land on a 0.7 floor; go straight to `^0.8`.
- **`oxlint-tsgolint` uses offset versioning.** 0.22.1 → 7.0.2001 is not a
  semver major — the `7.0.2` tracks the embedded TypeScript-Go release and
  `001` is its patch counter. Pin with a tilde, not a caret, or it will
  silently jump to a build targeting a different TypeScript minor. Skip
  7.0.2000 entirely (its Go binary ships mode 0644 and cannot execute), and
  always move it with `oxlint`, which declares `>=7.0.2001` as a peer.
- **`bun update <pkg>` inside a workspace can _add_ dependencies.** Running
  it for `react-dom`/`@types/react-dom` in `packages/app-convex` — which
  depends on neither — added both to `dependencies`. This is a sibling of
  the documented root-level footgun. Always `git diff` the manifests after
  any `bun update`, not just the lockfile.
- **Caret-satisfied packages don't move on `bun install`.** Anything already
  inside its range (react, `@types/react`, vitest) stays at the locked
  version; it needs an explicit `bun update` in the workspace directory.

### Notes on the 2026-08-17 kitcn/convex bump

kitcn 0.16.0 raised the `convex` peer floor from `>=1.38` to `>=1.42`, and in
0.17.4 it was still open-ended at `>=1.42`, so convex went to `latest` (1.44.0).
The two still move together — keep bumping them in one commit. (0.25.1 later
added an upper bound; see the 2026-08-17 kitcn 0.25.1 notes below.)

kitcn 0.17.0 carried five breaking changes. Four don't touch this repo (no
RLS policies, no `Ratelimit`, no `.withIndex()`, no cursor pagination —
`invitations.list` is offset-based and orders by `createdAt`, which aliases
Convex's `_creationTime` and is led by the default index). The two that could
have:

- **Middleware `next()` now wraps the handler**, and a `ctx` mutated on the
  return path no longer reaches it. `convex/lib/crpc.ts` already passed
  identity forward as `next({ ctx: { ...ctx, user } })`, so `authQuery` /
  `authMutation` were already on the new contract.
- **Chained `.input()` applies each schema separately** instead of flattening
  them. The auth builders stack `z.object({ sessionToken })` under each
  procedure's own schema; `parseInput` in kitcn's builder partitions keys by
  declaring schema and merges the results, and no key is declared twice, so
  `sessionToken` still reaches the middleware. Note the merge reads
  `schema.shape` — an `.input()` argument wrapped in a top-level `.refine()`
  would have no `.shape`. Every schema in `shared/tables/` is a plain
  `z.object`, so nothing was affected, but a future object-level refinement
  needs verifying against that code path.

Regenerated output moved for two independent reasons, both benign: convex
1.44.0 adds a typed `env` export to `_generated/server`, and kitcn 0.17.1
stopped emitting the unused `api` type import into
`generated/server.runtime.ts` (it only references `internal`).

`apps/web`'s `bun run test` fails with `ReferenceError: module is not defined`
from the Cloudflare workers pool. Verified pre-existing by stashing the bump
and re-installing — it fails identically at 0.15.17/1.42.3, and there are no
test files in either app. Unrelated to this bump; CI doesn't run it.

### Notes on the 2026-08-17 kitcn 0.25.1 bump (0.17.4 → 0.25.1, 11 releases)

Audited by diffing the published `dist/` of both versions chunk-by-chunk
(the changelog was deliberately not trusted). Chunk filenames are content-
hashed and differ between versions, so `diff -r` over `dist/` is noise —
match a chunk by its re-export chain or a distinctive identifier, normalize
the 8-char hashes, then diff those two files. Snapshots used:
`npm pack kitcn@<v>` into `/tmp`, never the live `node_modules`.

**`bun run codegen` is mandatory here, and `bun run typecheck` cannot tell
you that you skipped it.** `createOrm()` gained a `capabilities` array, and
the aggregate + migration runtimes moved out of the `kitcn/orm` barrel into
new subpath exports (`kitcn/orm/aggregate-index`, `kitcn/orm/migrations`).
The migration runtime is no longer in `kitcn/orm`'s module graph at all, so a
stale 0.17.4-era `generated/server.ts` still compiles — `capabilities?` is
optional and `OrmFunctions` is field-for-field unchanged — but
`migrationRun` / `migrationRunChunk` / `migrationStatus` / `migrationCancel`
then hard-fail **at call time**. Verification is a grep, not a gate:
`generated/server.ts` must contain `migrationCapability`. Never
`bunx kitcn deploy` 0.25.1 against un-regenerated bindings.

**Codegen adds two new files — `git commit -am` would ship a broken tree.**
The aggregate procedures split into their own Convex module, so regenerating
produces: NEW `convex/functions/generated/aggregate.ts` and
`generated/aggregate.runtime.ts` (both **untracked**, both must be
`git add`-ed); `generated/server.ts` loses its three `aggregateBackfill*`
exports, gains `capabilities: [migrationCapability()]`, and repoints
`ormFunctions.aggregateBackfillChunk` to `generated/aggregate:…`;
`generated/server.runtime.ts` drops the same three from its registry;
`_generated/api.d.ts` gains an `internal.generated.aggregate` block; and
`_generated/dataModel.d.ts` gains a `by_table_status` index on the
auto-injected `aggregate_state` table. `shared/api.ts` is unchanged.

**convex is now version-capped.** The peer narrowed from `>=1.42` to
`>=1.42 <1.45.0`. 1.44.0 (what all four workspaces pin, and still npm
`latest`) satisfies it with zero slack above. Do **not** bump convex to
1.45.x while kitcn is 0.25.1. Two soft mechanisms guard this and neither
fails a build: bun's peer warning, and — new in this delta — kitcn's own CLI,
which computes an upper bound and warns on `codegen` / `deploy` / `dev` /
`add` / `env` / `init` / `verify`. 0.17.4 checked only a floor. All four pins
are exact, so no install drifts past the cap on its own.

**`kitcn aggregate backfill|rebuild` became a silent no-op for this repo** —
the flow now short-circuits locally unless `schema.ts` declares an
`aggregateIndex(...)`/`rankIndex(...)`, which this repo doesn't. `prune` is
ungated. `kitcn migrate` gained a matching guard on `migrations/manifest.ts`
existing (it does). See [kitcn-cli-guide.md](kitcn-cli-guide.md).

**Verified unchanged** (this is the useful half of an 8-minor audit — each
was diffed in source, not assumed): the whole cRPC builder core
(`initCRPC.create()`, `.internal()`, stacked `.input()` partitioning, the
`.use()`/`next({ ctx })` middleware contract, handler signatures); every ORM
read/write compilation the repo exercises; `ctx.meta.getRequestMetadata()`;
`CRPCError`'s wire shape; the CLI's default-target asymmetry and full flag
surface; and — most load-bearing for this repo — the React decorator
method-name set (`queryOptions` / `staticQueryOptions` /
`infiniteQueryOptions` / `queryKey` / `queryFilter` / `infiniteQueryKey` /
`mutationOptions`) plus the `CRPCClient` type mapping and the
`[key: string]: unknown` index signature on api leaves. A new args-carrying
decorator would have silently bypassed `authed-crpc-proxy.ts`'s token
injection; there isn't one. **No hand-written code change was required.**

Three behavioral changes were real but harmless — they only falsified
comments, all corrected in the same commit:

- `useCRPCClient()` now returns a referentially **stable** proxy (the http
  merge moved into `CRPCProvider` and is memoized). The ref in
  `use-heartbeat.ts` stays — the point is that this contract has now flipped
  once.
- An indexed-field `inArray` ("multiProbe") now bounds each probe with
  `.take(offset + limit)` instead of `collect()`ing everything. The merged
  result is still sliced to one `limit` across all probes, so `users.list`'s
  per-user `eq()` shape is still the only thing that expresses "newest N per
  user". `IN_ARRAY_BATCH_SIZE = 30` in `lib/orm-helpers.ts` is **untouched
  and still correct** — the repo's only real `inArray` is on `id`, which has
  no leading index, so it still compiles to a left-folded `q.or` chain.
- `orderBy` pushdown into Convex's `.order()` is now conditional on the
  selected index being **fully pinned by `eq`** filters. Every current query
  is safe; the trap is in editing them (add a range filter, or widen a
  single-field index into a compound one, and `limit` silently degrades from
  a read bound to a post-fetch slice). Written down in
  [feature-session-audit.md](feature-session-audit.md).

Also: kitcn dropped `svix` from its dependencies (webhooks — unused here),
and `kitcn/orm` dropped 7 internal type exports, none of which the repo
imports. Gates after the bump: `check:fix` clean, `typecheck` 5/5,
`build` 2/2 (both apps prerender `/` → 200).

## Pending (audit 2026-07-26)

Snapshot from `bun outdated --filter '*'`. Risk column is a hint, not a
ceiling — read the changelog before applying anything tagged `high`.

| Package      | Current | Latest | Scope               | Risk | Notes                                                                                                                                                                                      |
| ------------ | ------- | ------ | ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typescript` | 6.0.3   | 7.0.2  | all five workspaces | high | TS 7 (native Go port) ships no programmatic compiler API and no `tsserver` until 7.1, silently breaking editors' "use workspace TypeScript version". No CI gate covers it. Revisit at 7.1. |
| `turbo`      | 2.10.6  | 2.10.7 | root                | low  | 2.10.7 is on npm `latest` but has no git tag, no GitHub release and no notes; its commits are an in-flight package-graph/discovery rewrite. Revisit once 2.10.8 ships with real notes.     |
