## Architecture: Backend

### Backend: kitcn on top of Convex

**Working with kitcn? Never assume — check first.** kitcn is a young library and its CLI has non-obvious defaults (the deploy/migrate/aggregate target asymmetry below is one example). Before claiming how kitcn behaves, advising a command invocation, or interpreting a builder API, consult in this order:

1. **Bundled skill docs**: `packages/backend/node_modules/kitcn/skills/convex/SKILL.md` and the `references/` tree beside it — these ship with the installed version, so they match the version pinned in `packages/backend/package.json` exactly, not some newer or older release.
2. **Official docs**: <https://kitcn.dev> for CLI, ORM, migrations, aggregate, RLS.
3. **Context7 MCP**: library ID `kitcn` — useful for API-level questions that aren't yet in the shipped skill docs.
4. **Source code**: `packages/backend/node_modules/kitcn/dist/` (cli.mjs, backend-core, orm/index.js) when steps 1–3 don't answer the question — especially for CLI flag behavior and internal mutation semantics.

Assumption-based guesses have already caused real production mis-routing in this repo (see the `--prod` rule for `kitcn aggregate` in [`docs/kitcn-cli-guide.md`](kitcn-cli-guide.md)). When in doubt, read the skill file.

kitcn is a tRPC-flavored builder layered on Convex. You author procedures with `.input(z.object(...))` → `.query/.mutation/.action(async ({ ctx, input }) => ...)` and kitcn handles validation, typing, and wiring into Convex. **Never edit the generated files directly** — after changing `convex/functions/*.ts` or `convex/functions/schema.ts`, run `bun run codegen` at the root (or `bun run dev` in `packages/backend`, which watches). Regenerated files:

- `packages/backend/convex/functions/_generated/*` (Convex core)
- `packages/backend/convex/functions/generated/*` (kitcn runtime shims, per-file `<name>.runtime.ts`)
- `packages/backend/convex/shared/api.ts` (the typed API leaf consumed by the frontend)

Procedure builders live in `packages/backend/convex/lib/crpc.ts`. The exported set:

| Builder                                              | Auth                                         | Internal-only       |
| ---------------------------------------------------- | -------------------------------------------- | ------------------- |
| `publicQuery` / `publicMutation` / `publicAction`    | none                                         | no                  |
| `authQuery` / `authMutation` / `authAction`          | **`.requires([...roles])` required**         | no                  |
| `privateQuery` / `privateMutation` / `privateAction` | —                                            | yes (`.internal()`) |
| `publicRoute` / `authRoute`                          | HTTP variants — `authRoute` also `.requires` | no                  |

The `auth*` variants are **namespace objects**, not builders directly. They expose a single method, `.requires(allowedRoles)`, which takes a non-empty tuple of `UserRole` values and returns the actual kitcn builder you chain `.input/.query/.mutation/...` onto. The roles parameter is typed `readonly [UserRole, ...UserRole[]]`, so the type system enforces a non-empty list — `.requires([])` is a compile error. Forgetting to call `.requires(...)` at all is also a compile error: `authMutation.input(...)` won't resolve because `authMutation` has no `.input` method, only `.requires`. This is the sole authorization model: **every authenticated procedure must declare which roles can call it at the procedure definition site.**

```ts
import { authMutation, authQuery } from "../lib/crpc";
import { USER_ROLES } from "../shared/tables/user";

// Only role === "user" can call:
export const importWithBatch = authMutation
  .requires(["user"])
  .input(z.object({ ... }))
  .mutation(async ({ ctx, input }) => { ... });

// Only role === "admin":
export const purgeAll = authMutation.requires(["admin"]).mutation(...);

// Both roles allowed (any authenticated user):
export const getMyProfile = authQuery.requires(USER_ROLES).query(...);
// ↑ pass USER_ROLES from shared/tables/user for the "any role" case —
// it's grep-friendly and stays in sync if a third role is ever added.
```

Inside the procedure, `ctx.user` is typed `IdentityUser` (id, email, name, **role**). There is no separate `ctx.userId` — use `ctx.user.id` instead. If the caller's JWT is missing or the role isn't in the allowed tuple, the middleware throws `UNAUTHORIZED` or `FORBIDDEN` (Chinese message) before the procedure body runs. Identity comes from Better Auth sessions via `getIdentityUser(ctx)`, which uses the shared `isEnumMember(USER_ROLES, ...)` guard from `convex/shared/enum-guard.ts` to validate the JWT's `role` claim — see [auth](auth.md) for how `role` gets onto every issued token.

### cRPC response envelope (important, enforced by convention)

Every non-private procedure must speak the same `{ code, message, data? }` shape on the wire for both branches. Helpers in `packages/backend/convex/lib/responses.ts`:

```ts
import { error, ok } from "../lib/responses";

// success
return ok({ userId }); // { code: "OK", message: "成功", data: { userId } }
return ok("已发送"); // { code: "OK", message: "已发送" }

// failure — always throw
throw error("BAD_REQUEST", "邀请码无效");
throw error("FORBIDDEN", "msg", { field: "x" }); // extra fields nested under data
```

**Do not** `throw new CRPCError(...)` directly and **do not** `return` raw data from a public procedure — both break the envelope. Private procedures are exempt (internal callers only).

On the client, failures arrive as `ConvexError` whose `.data` has the same shape. Normalize them with `packages/app-convex/src/errors.ts` (shared by both apps):

```ts
import { normalizeError, extractErrorMessage } from "@repo/app-convex/errors";

toast.error(extractErrorMessage(mutation.error) ?? "出现错误");
const err = normalizeError(mutation.error); // { code, message, data? }
```

User-facing messages are **Simplified Chinese**; error `code` values stay in English (consumed programmatically). The root document is `<html lang="zh-CN">`.
