# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Each doc below is imported into context. Read the relevant one(s) based on the task before answering or editing.

<!-- Monorepo layout: Turborepo + Bun workspaces (apps/web, apps/dashboard, packages/backend, packages/ui), root/per-workspace scripts, CI + Cloudflare Pages deploy pipeline. -->

@docs/monorepo-layout.md

<!-- Backend architecture: kitcn-on-Convex procedure builders (public/auth/private + `.requires([...roles])`), codegen workflow, and the `{code, message, data?}` cRPC response envelope. -->

@docs/backend-architecture.md

<!-- Auth flow: Better Auth + kitcn, JWT `role` claim, server-authoritative session gate via `fetchSessionClaims()`, stale-JWT refresh, and the two-file `auth-guard.ts` / `auth-guard.server.ts` split. -->

@docs/auth.md

<!-- Frontend architecture: TanStack Start + Router `_authenticated` / `_public` layouts, `-`-prefixed route-local slices (FSD-style), providers tree, stale-chunk self-heal in `__root.tsx`. -->

@docs/frontend-architecture.md

<!-- UI components: `@repo/ui` workspace with shadcn primitives (base-ui variant, no `asChild`), `components/custom-ui/` wrappers, and the shared generic `DataTable` with numbered pagination. -->

@docs/ui-components.md

<!-- Invitations: admin-minted signup codes, `active`/`used`/`revoked` state machine, admin-only procedures (`list`/`count`/`create`/`revoke`), dashboard CRUD slice. -->

@docs/feature-invitations.md

<!-- Conventions: bun as package manager, oxc (oxfmt/oxlint) tooling + ignore list, `isPending` vs `isLoading`, `useReducer`-for-coupled-state rule, one-source-of-truth + shared-schema-per-procedure rules, feature branches + codegen workflow, kitcn deploy/migrate/aggregate target asymmetry. -->

@docs/conventions.md

<!-- Dev environment: Conductor setup scripts + `.env` symlinks, portless named localhost URLs, multi-worktree Vite config. -->

@docs/dev-environment.md

## Operational references

<!-- Production migration playbook: two deployment modes (Convex Cloud vs self-hosted), full deploy → backfill → harden workflow for schema changes. Consult before running any `kitcn migrate` / `kitcn deploy` against prod. -->

@docs/MIGRATION.md

<!-- kitcn CLI command reference: deployment-target asymmetry matrix (`deploy` defaults to prod; `migrate` / `aggregate` default to dev), flag meanings, and worked examples. Consult before invoking any `bunx kitcn <subcmd>`. -->

@docs/kitcn-cli-guide.md

<!-- Version-bump log + procedure: append-only history of direct dependency bumps plus the checklist (adapter peer ranges, typecheck, SSR smoke) to follow on every bump, including patches. -->

@docs/version-bumps.md
