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

## Pending (audit 2026-05-05)

Snapshot from `bun outdated --filter '*'`. Risk column is a hint, not a
ceiling — read the changelog before applying anything tagged `high`.

| Package      | Current | Latest | Scope              | Risk    | Notes                                                                                                             |
| ------------ | ------- | ------ | ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `typescript` | 5.9.3   | 6.0.3  | all six workspaces | blocked | `kitcn@0.14.2` still hard-pins `typescript: "5.9.3"` as a runtime `dependencies` entry — upstream must ship TS 6. |
