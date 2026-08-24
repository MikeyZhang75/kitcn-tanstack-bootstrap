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
| 2026-08-21 | `kitcn`                    | 0.25.1   | 0.25.7   | all four workspaces                     | `849be17` |
| 2026-08-25 | `kitcn`                    | 0.25.7   | 0.27.3   | all four workspaces                     | `763ab6a` |

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
  `sessionToken` still reaches the middleware.

  The merge does read `schema.shape`, and an earlier revision of this note
  concluded from that a top-level `.refine()` on an `.input()` schema would
  break. **That conclusion was wrong** — it assumed zod 3. In zod 4 (4.4.3 here)
  `.refine()` / `.superRefine()` / `.check()` return `this`, cloning the same
  `ZodObject` with the check appended, so `.shape` survives. The real constraint
  is that the input **root must stay a `z.object`**: `.transform()` returns a
  `ZodPipe`, and root-level `.optional()` / `.nullable()` / union roots are
  likewise not objects — those genuinely break, and fail the type constraint
  first. Also worth knowing: on a stacked schema a refine only ever sees the
  keys that schema declares, never `sessionToken`.

  It remains repo policy to keep cross-field validation **out** of `.input()`
  schemas, for a different reason: `parseInput` runs outside the handler's try
  block and throws `ConvexError({ ZodError })`, which bypasses kitcn's error
  normalizer and reaches the client as a generic 「出现错误」 toast instead of the
  `{ code, message, data? }` envelope. See [auth](auth.md) 「密码管理」.

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
`>=1.42 <1.45.0`. 1.44.0 (what all four workspaces pin; npm `latest` moved on
to 1.45.0 on 2026-08-21) satisfies it with zero slack above. Do **not** bump
convex to 1.45.x while kitcn is 0.25.1–0.27.3 — the ceiling is byte-identical
across that whole range. Two soft mechanisms guard this and neither
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
  ⚠️ **Superseded at 0.25.4**, which replaced the fold with a flat variadic
  `q.or(...)`; see the 0.25.7 notes below.
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

### Notes on the 2026-08-21 kitcn 0.25.7 bump (0.25.1 → 0.25.7, 6 patches)

**convex did not move, and could not.** kitcn's `convex` peer is
`>=1.42 <1.45.0` at **both** 0.25.1 and 0.25.7 (the ranges are byte-identical —
this bump neither widened nor narrowed it), and 1.44.0 remains the highest
version satisfying that ceiling. It was also npm `latest` when this section was
written; 1.45.0 final shipped hours later on 2026-08-21 and took the tag, one
patch above the cap. The prerelease argument that used to carry this paragraph
(`1.45.0-alpha.0` fails `<1.45.0` under semver's default resolution) is still
true but no longer the point — 1.45.0 final is simply out of range. So this is
a **kitcn-only** bump — leave all four `convex` pins at `1.44.0`.

Audited by diffing the published `dist/` of every intermediate patch
(0.25.2 … 0.25.7), not by trusting the changelog. Method as before: `npm pack`
each version into `/tmp`, strip the content hashes from chunk filenames _and_
from in-file references, then `diff -r`. That normalization is what makes the
surface tractable — only **12 dist files** differ across the whole span:
`auth/index.d.ts`, `builder.js`, `capabilities.d.ts`, `cli.mjs`,
`generated-contract-disabled.d.ts`, `local-env.mjs`,
`orm/aggregate-index/index.js`, `orm/index.js`, `procedure-caller.js`,
`procedure-name.d.ts`, `schema.js`, `where-clause-compiler.d.ts`.

**Codegen emits one NEW file — `git commit -am` would ship a broken tree.**
0.25.5 split the procedure-name lookup out of `generated/server.ts` into
`convex/functions/generated/procedure-names.gen.ts` (**untracked** until you
`git add` it by name). `generated/server.ts` correspondingly loses its inline
21-entry literal and gains `import { procedureNames } from './procedure-names.gen';`
plus a one-line `registerProcedureNameLookup(procedureNames, "convex/functions")`.
Nothing is lost in the move — kitcn scrapes the existing literal out of the old
`server.ts` first, and all 21 entries came through verbatim. This is the same
class of hazard as 0.25.1's `aggregate.ts`, so the checklist in
[conventions.md](conventions.md) already covers it: after codegen, `git status`
for untracked files under `generated/` and grep `generated/server.ts` for
`migrationCapability` (still present, still `capabilities: [migrationCapability()]`).

The two-dot basename is deliberate and is **not** blocked by the "no hyphens in
Convex module paths" rule: convex's bundler skips any entry-point basename
containing more than one dot, so `procedure-names.gen.ts` never becomes a module
path — same mechanism that already lets `*.runtime.ts` and `migrations.gen.ts`
carry dots and hyphens. Verified in `convex/dist/cli.bundle.cjs`'s `entryPoints()`
and corroborated by `_generated/api.d.ts`, which lists zero `runtime` modules.

Codegen also leaves an **empty** `generated/migrations/` directory behind (0.25.7
pre-creates runtime placeholders and `rmSync`s them in a `finally`). git doesn't
track empty dirs, so it produces no diff — but don't blanket-`git add` the
`generated/` directory; add the one new file by name.

**The one hand-written change this bump required was a comment.** 0.25.4
replaced kitcn's left-folded `inArray` compilation —
`values.map(...).reduce((acc, c) => q.or(acc, c))`, whose serialized JSON depth
grew as `2N + 1` — with a single flat variadic `q.or(...)` of constant depth.
That is precisely the behavior `IN_ARRAY_BATCH_SIZE = 30` in
`lib/orm-helpers.ts` was introduced to work around, so its comment (and the
matching parenthetical in [feature-invitations.md](feature-invitations.md))
became false and were rewritten. The constant itself stays: it's now
belt-and-braces bounding how many `eq` terms one `.filter()` carries, and the
repo's only real `inArray` is on `user.id`, which has no leading index and so
still resolves as an unindexed scan per chunk. The 0.25.1 note above is marked
superseded rather than rewritten in place.

**Verified unchanged** (the useful half of a 6-patch audit — each diffed in
source, not assumed):

- `dist/react/` is **byte-identical**, so every decorator
  (`queryOptions` / `staticQueryOptions` / `infiniteQueryOptions` / `queryKey` /
  `queryFilter` / `infiniteQueryKey` / `mutationOptions`) is unchanged and
  `authed-crpc-proxy.ts`'s token injection can't be bypassed by a new
  args-carrying decorator.
- `CRPCError`'s wire shape, so the `{ code, message, data? }` envelope and every
  Simplified-Chinese toast still work; `executeMiddlewares` and `initCRPC`, so
  `crpc.ts`'s `next({ ctx: { ...ctx, user, session } })` contract is intact.
- `parseInput` is still called one statement _before_ the handler's `try`, so
  the `.refine()` ban documented in [auth](auth.md) 「密码管理」 is still correctly
  motivated — an `.input()` ZodError still escapes the normalizer.
- `splitFilters` and `resolveIndexOrderPushdown`, so
  `end-user-sessions.ts`'s `and(eq(userId), eq(status))` still pins both fields
  of `index("userId_status")`, `orderBy` still pushes down, and
  `SESSION_REVOKE_BATCH_MAX` is still a real read bound (the drain-across-calls
  property in [feature-session-audit.md](feature-session-audit.md) holds).
- `migrationCapability()` itself — no repeat of the 0.25.0 "compiles but fails
  at call time" trap.
- Every CLI target-resolution function (`extractConvexRunTargetArgs`,
  `readConvexTargetEnvFile`, `backendUsesAggregateIndexes`,
  `backendUsesMigrations`, `runAggregateBackfillFlow`), so
  [kitcn-cli-guide.md](kitcn-cli-guide.md) and [MIGRATION.md](MIGRATION.md)
  needed no edits: the `deploy`=prod / `migrate`+`aggregate`=dev asymmetry, the
  aggregate short-circuit, ungated `prune`, and the `manifest.ts` gate all still
  hold. `cli.mjs` is in fact byte-identical from 0.25.2 onward.
- `_generated/` and `shared/api.ts` regenerate byte-identical, so the frontend's
  entire type surface is untouched.

Several advertised fixes are **unreachable here** and were confirmed dead by
grep: 0.25.6's `.output()` / `.paginated()` error sanitization and its HTTP-route
fault logging (no `.output()`, no `.paginated()`, and `http.ts` registers
`router({})` with zero routes), and 0.25.3's aggregate `isNull` two-bucket fix
(no `isNull`/`groupBy`, no `aggregateIndex()`, and both `count()` calls are
unfiltered so they short-circuit before the aggregate compiler).

**Known available follow-up (not taken here):** 0.25.2 switched kitcn's own
internals from `import { z } from 'zod'` to `import * as z from 'zod'` to
tree-shake zod's 53 locale modules. Measured against this repo's toolchain, the
saving is currently **cancelled**: zod's named export is a materialized
namespace object, so a single named import anywhere in the graph re-pins the
whole locale set (531.5 kb with `{ z }`, 127.6 kb with `* as z`, 531.6 kb with
both). Five backend files still use the named form —
`convex/lib/crpc.ts` and `convex/shared/tables/{user,session,invitations,settings}.ts`
— and all are in every Convex function's module graph. Switching them is a
one-line-each change that only uses members present on the namespace, but it
belongs in its own commit so a bundle-size regression stays bisectable.

### Notes on the 2026-08-25 kitcn 0.27.3 bump (0.25.7 → 0.27.3, 8 releases)

**No hand-written code change and no generated-file change was required.**
`bun run codegen` reproduces the committed tree byte-for-byte and `git status`
stays clean of untracked files — the first bump in three where that is true
(0.25.1 added `generated/aggregate.ts` + `aggregate.runtime.ts`, 0.25.5 added
`generated/procedure-names.gen.ts`). Every path helper in the codegen writer
maps 1:1 between the two versions, so the file set is provably fixed, not just
observed. `generated/server.ts` still carries
`capabilities: [migrationCapability()]`, and `dist/orm/migrations/` is
byte-identical — no repeat of the 0.25.0 "compiles but fails at call time" trap.
Codegen still leaves an **empty** `generated/migrations/` directory behind
(untracked by git, no diff); keep adding new generated files by name rather
than `git add`-ing the directory.

**convex could not move, again — and this time a real 1.45.0 exists.** kitcn's
`convex` peer is `>=1.42 <1.45.0` at **every** version from 0.25.7 through
0.27.3 inclusive, byte-identical; `cli.mjs:2180` still reads
`SUPPORTED_CONVEX_VERSION = "1.44.0"` at the same line number, and the cap is
`getNextMinorVersion` of it. convex 1.45.0 took npm `latest` on 2026-08-21, so
"bump both to latest" is not satisfiable. Be honest about what the bound is:
**it is auto-derived from a pinned version, not a tested one, and no concrete
incompatibility was found.** kitcn imports exactly five public specifiers
(`convex/{browser,nextjs,react,server,values}`) and all five subpath trees are
byte-identical between 1.44.0 and 1.45.0; the only public type delta is one
added line (`getServiceToken` promoted from `@internal`, already exported at
runtime in 1.44.0). Two concrete costs argue against bumping anyway:

- kitcn would warn on every command this repo runs.
  `warnSupportedDependencyIssues` fires for `{add, codegen, deploy, dev, env,
init, verify}` and checks the **installed** version before the declared spec,
  so the exact `"1.44.0"` pin would not mask it. Reproduced verbatim:
  `⚠️  kitcn expects convex >=1.42 <1.45.0; found 1.45.0. Run `bun add convex@1.44.0` when you can.`
  It is warning-only but unsuppressable (`logger.warn`, no quiet flag), and
  `packages/backend/package.json` runs all three of `kitcn dev` / `codegen` /
  `deploy --yes`. `kitcn migrate` and `kitcn aggregate` emit nothing, so the
  migration path gives no off-range signal at all.
- convex 1.45.0 raises `engines.node` `>=18` → `>=20` and turns the Node < 20
  soft warning into `process.exit(1)`. Its changelog does not mention this.
  Harmless here today (no `engines` field, no `.nvmrc`, no CI), but kitcn's own
  `SUPPORTED_LOCAL_CONVEX_NODE_MAJORS` still lists 18, so kitcn will not rescue
  a Node 18 host. Add `"engines": { "node": ">=20" }` to the root
  `package.json` in whichever commit finally moves convex.

Revisit when kitcn ships a `SUPPORTED_CONVEX_VERSION` of `1.45.x`; the two then
move in one commit, as they have since 0.15.0.

Audited by diffing the published `dist/` of all nine versions (0.25.7, 0.26.0–3,
0.27.0–3), not by trusting the changelog. ⚠️ **The hash-normalization step from
the previous audits has a silent data-loss bug — fix it before reusing it.**
Naively stripping `-<8 chars>` from every chunk filename collapses the four
root-level `types-*.d.ts` files onto one name, and the renames overwrite each
other: 84 files in, 81 files out, three compared against the wrong counterpart.
Only strip the hash when the stripped name is **unique within its directory**;
otherwise leave the original name (colliding chunks kept identical hashes across
this span, so they still pair up). With that fixed, exactly **18 dist files**
differ across the whole span: `auth/index.{js,d.ts}`,
`auth/start/server/index.{js,d.ts}`, `caller-factory.js`, `capabilities.d.ts`,
`cli.mjs`, `create-schema.js`, `generated-contract-disabled.d.ts`,
`local-env.mjs`, `orm/aggregate-index/index.js`, `orm/index.js`,
`react/index.js`, `rsc/index.js`, `runtime.js`, `schema.js`, `solid/index.js`,
`where-clause-compiler.d.ts`. kitcn's `package.json` differs by exactly the
version string — no dependency, peer, or exports-map change.

**Verified unchanged** — the useful half of an 8-release audit; each was diffed
in source, not assumed:

- `builder.js` is byte-identical, so `parseInput` still runs one statement
  _outside_ the handler's `try` and the `.refine()` ban in [auth](auth.md)
  「密码管理」 stays correctly motivated. `initCRPC`, `executeMiddlewares` and the
  `next({ ctx })` contract come with it, so `crpc.ts`'s
  `next({ ctx: { ...ctx, user, session } })` is intact.
- `error.js`, `procedure-caller.js` and the whole `dist/server/` tree are
  byte-identical → the `{ code, message, data? }` envelope, `errors.ts`'s
  normalizer, and every symbol the committed `*.runtime.ts` files import.
- `dist/react/index.d.ts` is byte-identical, and the decorator method-name set
  is identical (15 names). ⚠️ Do **not** restate the 0.25.7 note's claim that
  "`dist/react/` is byte-identical" — that was scoped to its own span, and
  `react/index.js` **did** change at 0.27.1. The successor claim is the narrower
  one: no new args-carrying decorator exists, so `authed-crpc-proxy.ts`'s token
  injection cannot be bypassed.
- `CRPCProviderInner`'s body — including every `useMemo` dependency array — is
  identical, so `useCRPCClient()` is still referentially stable and the ref in
  `use-heartbeat.ts` remains correctly motivated. `skipToken` handling is
  identical at all six sites.
- `splitFilters` and `resolveIndexOrderPushdown` are byte-identical, traced
  end-to-end: `end-user-sessions.ts`'s `and(eq(userId), eq(status))` still
  scores `index("userId_status")` above `index("userId")`, consumes both `eq`s
  into the index range leaving no post-fetch filter, pins every index field so
  `orderBy` still pushes into `.order('desc')`, and takes the `query.take(limit)`
  branch — `SESSION_REVOKE_BATCH_MAX` is still a real read bound and bulk
  termination still drains across calls. `users.list`'s per-user `.take(200)`
  is likewise still a genuine cap.
- `convexOr` is byte-identical, so the flat variadic `$or` holds and
  `IN_ARRAY_BATCH_SIZE = 30` in `lib/orm-helpers.ts` keeps its 0.25.7 rationale.
  Indexed-`inArray` multiProbe is unchanged, so the "one batched `inArray` can't
  express newest-N-per-user" argument in
  [feature-session-audit.md](feature-session-audit.md) still holds.
- Unfiltered `count()` still short-circuits to the native Convex syscall before
  touching the aggregate compiler, and `AggregateNoScanWhereArg` is
  byte-identical — so `invitations.count` / `users.count` still need no
  `aggregateIndex`, and `count({ where })` still fails to typecheck without one.
- `findFirst` is **unchanged**; all 20 `ctx.orm.query.*.findFirst` call sites
  keep identical cost and error semantics. 0.27.2's "page until match" rewrite
  is the Better Auth adapter's `listOne` in `auth/index.js` — a different
  function on a path this repo does not use.
- `where-clause-compiler.d.ts`'s 314 diff lines at an identical byte count are
  pure member reordering inside two object types — zero type-surface change.
- The CLI's entire target-resolution surface: `deploy`=prod /
  `migrate`+`aggregate`=dev asymmetry, the aggregate short-circuit, ungated
  `prune`, and the `manifest.ts` gate. `cli.mjs`'s only diff is the Better Auth
  template and generated-index regions, so
  [kitcn-cli-guide.md](kitcn-cli-guide.md) and [MIGRATION.md](MIGRATION.md)
  needed no edits.

Real changes that **cannot reach this repo**, confirmed by grep rather than
assumed: nested `with:` depth 3 → 10 with overflow flipped from silent
truncation to a `RELATION_DEPTH_EXCEEDED` throw (0.27.0 — `schema.ts` declares
no relations and the repo has zero `with:`); per-source `index` on
`.union([...])` going from silently ignored to honored (0.26.3 — zero unions);
composite Better Auth organization indexes added to the generated auth schema
and the `convexBetterAuthReactStart` options breaking change (0.27.2 / 0.26.0 —
the repo's only `kitcn/auth` import is `kitcn/auth/generated`, which is
byte-identical, and there is no `better-auth` dependency at all); and the
aggregate `CLEARING` drain fix (0.27.3 — no `aggregateIndex`/`rankIndex`).

⚠️ **Two latent traps this bump introduces.** Neither has a call site today;
both are type-reachable and would fail quietly.

- **`queryFilter` through `useAuthedCRPC()` is permanently token-scoped.**
  0.27.1 made `queryFilter()` with absent/empty args emit a **2-element prefix
  key** that matches every args variant (before, it emitted
  `[..., ..., undefined]`, which TanStack's `partialMatchKey` matched against
  nothing). But `authed-crpc-proxy.ts` lists `"queryFilter"` in `ARGS_METHODS`
  and `injectArgs` always returns `{ ...args, sessionToken }` — never empty — so
  the prefix key is unreachable through the authed proxy and the filter is
  pinned to one exact token value. It still matches today's queries, because they
  all carry that same token; it stops matching the moment the token rotates
  (`account.changePassword` mints a replacement). Fix when the first
  `invalidateQueries(authed.X.queryFilter())` lands: give `queryFilter` its own
  branch that forwards args **unchanged**. A filter key is a matching pattern,
  never a wire payload, so it needs no token to satisfy Convex's arg validator —
  which is the whole reason the injection exists. That change would also need a
  carve-out noted at [auth](auth.md)'s list of injected decorators.
- **`queryKey.length` is now semantically load-bearing.** `isConvexQuery` /
  `isConvexAction` tightened from `length >= 2` to `>= 3` (0.27.1), the
  mandatory companion to the above — a 2-element key reaching `hashConvexQuery`
  would `convexToJson(undefined)` and throw. The repo **is** in this path
  (`convex-provider.tsx` merges kitcn's `queryKeyHashFn` into the QueryClient
  defaults), but every key it produces is 3-element. The trap is that a
  hand-rolled 2-element key now degrades **silently** into a non-Convex query
  that never opens a WS subscription, where 0.25.7 failed loudly at hash time.

Gates after the bump: `oxfmt --check` clean, `oxlint --type-aware
--max-warnings 0` clean, `typecheck` 5/5, `build` 2/2 (both apps prerender `/`
→ 200).

## Pending (audit 2026-07-26)

Snapshot from `bun outdated --filter '*'`. Risk column is a hint, not a
ceiling — read the changelog before applying anything tagged `high`.

| Package      | Current | Latest | Scope               | Risk    | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------- | ------ | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript` | 6.0.3   | 7.0.2  | all five workspaces | high    | TS 7 (native Go port) ships no programmatic compiler API and no `tsserver` until 7.1, silently breaking editors' "use workspace TypeScript version". No CI gate covers it. Revisit at 7.1.                                                                                                                                                                    |
| `turbo`      | 2.10.6  | 2.10.7 | root                | low     | 2.10.7 is on npm `latest` but has no git tag, no GitHub release and no notes; its commits are an in-flight package-graph/discovery rewrite. Revisit once 2.10.8 ships with real notes.                                                                                                                                                                        |
| `convex`     | 1.44.0  | 1.45.0 | all four workspaces | blocked | Out of kitcn's `>=1.42 <1.45.0` peer, which is byte-identical at every version through 0.27.3 (`SUPPORTED_CONVEX_VERSION` is still `1.44.0`). No concrete incompatibility was found in source, but bumping trips an unsuppressable kitcn warning on `dev`/`codegen`/`deploy`. Revisit when kitcn's supported convex reaches 1.45.x; see the 2026-08-25 notes. |
