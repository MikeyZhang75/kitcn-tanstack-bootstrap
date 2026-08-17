# Production Migration Guide

This repo can target **two deployment modes** and the migration workflow differs
between them. Run all commands from `packages/backend/`.

> Official reference: <https://kitcn.dev/docs/orm/migrations>

## Modes

| Mode             | When                                                                     | Targeting prod         |
| ---------------- | ------------------------------------------------------------------------ | ---------------------- |
| **Convex Cloud** | `CONVEX_DEPLOY_KEY=prod:<name>\|<token>` is available                    | `--prod` flag          |
| **Self-hosted**  | `CONVEX_SELF_HOSTED_URL` + `CONVEX_SELF_HOSTED_ADMIN_KEY` in `.env.prod` | `--env-file .env.prod` |

Pick the column that matches your deployment throughout this guide. Never
mix the two on the same project.

## The deployment-target asymmetry (read this first)

| Command                       | Default target               | How to force prod (cloud)              | How to force prod (self-hosted) |
| ----------------------------- | ---------------------------- | -------------------------------------- | ------------------------------- |
| `bunx kitcn deploy`           | **prod**                     | (already default)                      | `--env-file .env.prod`          |
| `bunx kitcn migrate <subcmd>` | **dev** (reads `.env.local`) | `--prod` + ambient `CONVEX_DEPLOY_KEY` | `--env-file .env.prod`          |
| `bunx kitcn codegen`          | dev                          | (never targets prod)                   | (never targets prod)            |

This asymmetry bites: `kitcn deploy` pushes your schema to prod by default,
but `kitcn migrate up` silently runs against **dev** unless you force the
target.

## When you do NOT need a migration (read this before writing one)

Convex is not SQL. kitcn's own guidance (`packages/backend/node_modules/kitcn/skills/kitcn/references/features/migrations.md`)
says to **skip migrations for backward-compatible changes**:

- Adding **optional** fields (`text()` without `.notNull()`)
- Adding **new tables** or new indexes
- **Widening** a `textEnum(...)` — adding a value, not removing one
- Anything a code-level default (`doc.field ?? "…"`) can cover

**Rule:** old documents still pass the schema and the app logic → no
migration. Old documents would fail → migrate.

Everything below in this file is about the cases that _violate_ that rule.
`.notNull()` is the trigger: the deploy fails at schema validation if any
existing row lacks the field. An optional column has no such edge — a document
without the key satisfies `v.optional(...)`.

Enum widening is safe for the same structural reason. kitcn's `textEnum`
compiles to `v.union(v.literal(...))`, so adding a value only expands the
accepted set and every stored row still validates on push. **Narrowing** —
removing a value — is the direction that needs a migration, and kitcn's own
reference lists it as such. Nothing else has to be rebuilt either, as long as the
column isn't part of an index or an `aggregateIndex`.

Worked example — the session audit feature, which needed both kinds:

- `ipAddress` / `userAgent` / `lastSeenAt` / `endedAt` / `revokedBy` are all
  optional columns on `session` → **no migration**. Pre-existing rows simply
  carry no metadata.
- `session.status` is required → **migration needed**, and it's the repo's
  first: `20260816_234850_backfill_session_status` sets `active` on rows written
  before the column existed. Follow the flow below.

See [session audit](feature-session-audit.md).

Second worked example — password management ([auth](auth.md) 「密码管理」) — which
needed **no** migration at all despite touching the schema twice:

- `credentials.passwordUpdatedAt` / `passwordUpdatedBy` are optional columns.
- `session.status` gained a fourth value, `password_changed` — a widening.

⚠️ Do **not** bundle an enum widening with the still-pending `.notNull()`
hardening of `session.status`. The widening is unconditionally safe; the
hardening still requires the backfill to have run against **prod** first (step 4
below, which must be triggered by hand). Ship them as separate deploys.

## Adding a Required Field to an Existing Table

Never deploy a `.notNull()` field before existing rows have that value set.
The workflow is: deploy optional → backfill → harden → re-deploy.

### Step 1: Add the field as optional

```ts
// schema.ts
role: textEnum(USER_ROLES),  // no .notNull()
```

### Step 2: Create the migration

```bash
bunx kitcn migrate create backfill_<field_name>
```

Edit the generated file in `convex/functions/migrations/`:

```ts
export const migration = defineMigration({
  id: "<generated_id>",
  description: "Backfill <field> on existing <table>",
  up: {
    table: "<table_name>",
    migrateOne: async (_ctx, doc) => {
      if (doc.<field> === undefined || doc.<field> === null) {
        return { <field>: "<default_value>" };
      }
    },
  },
  down: {
    table: "<table_name>",
    migrateOne: async (_ctx, doc) => {
      if (doc.<field> !== undefined) {
        return { <field>: undefined };
      }
    },
  },
});
```

### Step 3: Deploy the optional schema + migration code to prod

**Convex Cloud**

```bash
bunx kitcn deploy --yes
```

**Self-hosted**

```bash
export $(grep -v '^#' .env.prod | xargs) && bunx convex deploy \
  --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" \
  --url "$CONVEX_SELF_HOSTED_URL"
```

This pushes the schema change and the migration source to production, but
does **not** run the migration against prod — `kitcn deploy`'s internal
migrate check runs against dev, so it will usually print
`No pending migrations to apply.` Ignore that line in this flow.

### Step 4: Run the migration against prod

⚠️ **You must run this by hand.** Earlier revisions of this doc claimed CI
does it via a "Run Convex migrations (prod only)" step in
`.github/workflows/deploy.yml` — **there is no `.github/` directory in this
repo** (`git ls-files | grep github` returns nothing), so no such step exists.
Forgetting it is the #1 migration footgun here: the backfill silently targets
dev and prod rows stay unmigrated, and the subsequent `.notNull()` deploy then
fails schema validation.

**Convex Cloud**

```bash
CONVEX_DEPLOY_KEY='prod:<name>|<token>' bunx kitcn migrate up --prod --yes
```

**Self-hosted**

```bash
bunx kitcn migrate up --env-file .env.prod --yes
```

Drop the flag entirely to target dev — which is what you want while
developing, and what `bunx kitcn migrate up --yes` does.

### Step 5: Verify

**Convex Cloud**

```bash
CONVEX_DEPLOY_KEY='prod:<name>|<token>' bunx kitcn migrate status --prod
```

**Self-hosted**

```bash
bunx kitcn migrate status --env-file .env.prod
```

Confirm `pending: []` and that the relevant entry under `migrations` has
`status: "completed"` with `processed` ≥ the number of existing rows.

### Step 6: Harden the schema

```ts
// schema.ts
role: textEnum(USER_ROLES).notNull(),
```

If any query had a `?? default` fallback on this field (to tolerate
pre-migration rows during the window), remove it at this step too — the
return type will now narrow from `T | undefined` to `T`.

Also run `bun run codegen` so the generated bindings reflect the new
nullability.

### Step 7: Re-deploy with the required field

**Convex Cloud**

```bash
bunx kitcn deploy --yes
```

**Self-hosted**

```bash
export $(grep -v '^#' .env.prod | xargs) && bunx convex deploy \
  --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" \
  --url "$CONVEX_SELF_HOSTED_URL"
```

`Schema validation complete.` in the output confirms every prod row
satisfies the new constraint. If this step fails with a schema validation
error, the backfill was incomplete — re-run Step 4 and verify again
before retrying.

### Step 8: Patch any code that creates new rows

If the field is written by third-party code (e.g. Better Auth's
`signUpEmail`), that code doesn't know about your custom field. After
Step 6 the schema rejects inserts missing the field, so you must patch
the creation path. Example from `signup.ts`:

```ts
await auth.api.signUpEmail({ body: { ... } });
// Better Auth doesn't know about `role` — set it immediately after.
await ctx.orm
  .update(userTable)
  .set({ role: "user" })
  .where(eq(userTable.id, result.user.id));
```

## Removing a Field from an Existing Table

### Step 1: Add field back as optional (if already hardened)

```ts
// schema.ts — field must exist as optional so schema validates
bio: text(),
```

### Step 2: Create the removal migration

```bash
bunx kitcn migrate create remove_<field_name>
```

```ts
export const migration = defineMigration({
  id: "<generated_id>",
  description: "Remove <field> from <table>",
  up: {
    table: "<table_name>",
    migrateOne: async (_ctx, doc) => {
      if ("<field>" in doc) {
        return { <field>: undefined };
      }
    },
  },
});
```

### Step 3: Deploy schema (with optional field) + migration code

**Convex Cloud**

```bash
bunx kitcn deploy --yes
```

**Self-hosted**

```bash
export $(grep -v '^#' .env.prod | xargs) && bunx convex deploy \
  --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" \
  --url "$CONVEX_SELF_HOSTED_URL"
```

### Step 4: Run the removal migration

**Convex Cloud**

```bash
CONVEX_DEPLOY_KEY='prod:<name>|<token>' bunx kitcn migrate up --prod --yes
```

**Self-hosted**

```bash
bunx kitcn migrate up --env-file .env.prod --yes
```

### Step 5: Delete the field from the schema

```ts
// schema.ts — delete the column entirely, then `bun run codegen`
```

### Step 6: Re-deploy without the field

**Convex Cloud**

```bash
bunx kitcn deploy --yes
```

**Self-hosted**

```bash
export $(grep -v '^#' .env.prod | xargs) && bunx convex deploy \
  --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" \
  --url "$CONVEX_SELF_HOSTED_URL"
```

## Other Commands

```bash
# --- Convex Cloud (CONVEX_DEPLOY_KEY exported ambiently) ---
bunx kitcn migrate status --prod
bunx kitcn migrate down --steps N --prod --yes
bunx kitcn migrate cancel --prod

# --- Self-hosted ---
bunx kitcn migrate status --env-file .env.prod
bunx kitcn migrate down --steps N --env-file .env.prod --yes
bunx kitcn migrate cancel --env-file .env.prod
```

Drop the flag entirely to target dev.

## WARNING

- **NEVER** run `generated/server:reset` — it wipes the entire database.
- **NEVER** deploy a `.notNull()` field before backfilling existing rows —
  the deploy will fail at schema validation if any row is missing the field.
- **ALWAYS** pass `--prod` (Cloud, with `CONVEX_DEPLOY_KEY` in ambient env)
  or `--env-file .env.prod` (self-hosted) to `kitcn migrate` when targeting
  production. Forgetting the target is the #1 migration footgun in this
  repo.
- Deploys read the working tree, not HEAD. Commit before `bunx kitcn deploy`
  if you want git and prod to match.

For authoritative command reference, see the official kitcn migration docs:
<https://kitcn.dev/docs/orm/migrations>
