# kitcn CLI guide

Short reference for kitcn CLI commands used in this project. Run all commands
from `packages/backend/`.

> Official CLI: `bunx kitcn --help` · Docs: <https://kitcn.dev>

## Deployment-target asymmetry (read this first)

kitcn subcommands **do not share a default target**. `deploy` targets prod
by default; `migrate`, `aggregate`, `codegen`, and `dev` target dev. To
force a standalone `migrate` or `aggregate` run against Cloud prod, pass
`--prod` with `CONVEX_DEPLOY_KEY` exported in the ambient env. For
self-hosted, pass `--env-file .env.prod` instead.

| Command                         | Default target | Force prod (cloud)                        | Force prod (self-hosted) |
| ------------------------------- | -------------- | ----------------------------------------- | ------------------------ |
| `bunx kitcn deploy`             | **prod**       | (default; ambient `CONVEX_DEPLOY_KEY` OK) | `--env-file .env.prod`   |
| `bunx kitcn migrate <subcmd>`   | dev            | `--prod` + ambient `CONVEX_DEPLOY_KEY`    | `--env-file .env.prod`   |
| `bunx kitcn aggregate <subcmd>` | dev            | `--prod` + ambient `CONVEX_DEPLOY_KEY`    | `--env-file .env.prod`   |
| `bunx kitcn codegen`            | dev            | n/a                                       | n/a                      |
| `bunx kitcn dev`                | dev            | n/a                                       | n/a                      |

## Aggregate commands

Aggregate indexes are declared via `aggregateIndex(...)` in `schema.ts`
(e.g. a `count_by_ownerId` index on a table you want to count by owner).
They power `ctx.orm.query.<table>.count({...})` and must be built before
`count()` works.

| Subcommand                 | Mode      | When to use                                                                      |
| -------------------------- | --------- | -------------------------------------------------------------------------------- |
| `kitcn aggregate backfill` | `resume`  | Incremental — process un-indexed rows only. Safe, no downtime.                   |
| `kitcn aggregate rebuild`  | `rebuild` | Clear bucket/member/extrema rows, reset state to `BUILDING`, rescan whole table. |
| `kitcn aggregate prune`    | `prune`   | Remove aggregate rows for indexes that no longer exist in the schema.            |

Behind the scenes all three call the generated `aggregateBackfill` internal
mutation with a different `mode`. `rebuild` calls `clearCountIndexData()`
before rescanning — any `count()` query against that index throws
`BUILDING` until the rebuild finishes. `resume` skips already-READY indexes.

### Triggering rebuild in prod (Convex Cloud)

```bash
cd packages/backend
CONVEX_DEPLOY_KEY='prod:<name>|<token>' bunx kitcn aggregate rebuild --prod
```

### Triggering rebuild in prod (self-hosted)

```bash
cd packages/backend
bunx kitcn aggregate rebuild --env-file .env.prod
```

`.env.prod` must contain `CONVEX_SELF_HOSTED_URL` and
`CONVEX_SELF_HOSTED_ADMIN_KEY`. Mirror the pattern in `MIGRATION.md`.

### Triggering rebuild in dev

```bash
cd packages/backend
bunx kitcn aggregate rebuild
```

Uses `CONVEX_DEPLOYMENT` from `.env.local`.

### Verifying the rebuild

The CLI streams progress as `aggregateBackfill progress N/M READY`. For a
post-hoc check, query the `aggregate_state` table directly:

```bash
CONVEX_DEPLOY_KEY='prod:<name>|<token>' \
  bunx convex data aggregate_state --prod
```

Expected: one row per aggregate index with `status: "READY"`, `lastError: null`,
and `processed` matching the table's row count. An empty `aggregate_bucket`
with `processed: 0` means the underlying table is empty — that's correct,
not a bug.

## Automatic backfill hooks

Aggregate backfill runs automatically in two flows:

- **`kitcn dev`** — resume mode on bootstrap and on every schema change.
- **`kitcn deploy`** — resume mode after migrations, before exiting.

Neither flow runs `rebuild`. If an index definition changes in a way that
requires a rebuild (keyDefinitionHash mismatch), `kitcn deploy` logs a
warning instructing you to run `kitcn aggregate rebuild` for that
deployment — you must run it manually against the target.

## Flags worth knowing

| Flag                                     | Scope                  | Effect                                                           |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `--prod`                                 | aggregate, migrate     | Target Convex Cloud prod (requires ambient `CONVEX_DEPLOY_KEY`). |
| `--env-file <path>`                      | all                    | Load env from file. Standard path for self-hosted (`.env.prod`). |
| `--backfill=auto\|on\|off`               | deploy, dev            | Toggle auto-backfill in deploy/dev flows.                        |
| `--backfill-wait` / `--no-backfill-wait` | deploy, dev, aggregate | Block until READY or return immediately.                         |
| `--yes`                                  | deploy, reset          | Skip interactive confirmation.                                   |

## Related docs

- [`MIGRATION.md`](MIGRATION.md) — same asymmetry, applied to `migrate` subcommands and backfill migrations.
