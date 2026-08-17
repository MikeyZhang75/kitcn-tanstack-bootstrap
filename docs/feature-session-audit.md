### Session audit: status state machine, IP/UA capture, liveness, revocation

Session rows are **never deleted**. Sign-out and admin revocation both flip a
`status` column, so the `session` table _is_ the login audit trail. Each row
also records the IP / User-Agent it was created from and the last time the
client was seen alive. Admins browse and revoke sessions from the dashboard
`/users` page.

> History: an earlier iteration deleted the row on sign-out and compensated
> with a separate append-only `loginLog` table. The status machine subsumes it,
> and that table is gone.

#### Storage — one table, four display states

`sessionTable` (`packages/backend/convex/functions/schema.ts`):

| Column                    | Notes                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `token`                   | unique bearer credential, 64 hex chars                       |
| `userId`                  | FK → user                                                    |
| `status`                  | `active` \| `signed_out` \| `revoked`                        |
| `expiresAt`               | absolute, 30 days from creation                              |
| `lastSeenAt`              | bumped only by `session.heartbeat`; null until the first one |
| `endedAt`                 | when the row left `active`, either path                      |
| `revokedBy`               | admin who kicked it; null for a self-service sign-out        |
| `ipAddress` / `userAgent` | request attribution at mint time                             |

**"Expired" is deliberately not a status.** It's derived by comparing
`expiresAt` against the current time — materialising it would need a cron to
flip rows and buy nothing, since the auth middleware checks both. The UI
therefore renders four states (活跃 / 已过期 / 已退出 / 已终止) from three
stored ones; `resolveDisplayStatus` in the dashboard slice's `-model/` owns
that derivation.

`index("userId")` is load-bearing now — it backs both the per-user session list
and the `/users` active-session summary.

#### Where IP / User-Agent come from — `ctx.meta.getRequestMetadata()`

```ts
const { ip, userAgent } = await ctx.meta.getRequestMetadata();
```

Available on **mutations and actions**, and **not on queries** (`MutationMeta`
declares `getRequestMetadata()`, `QueryMeta` doesn't — the value isn't part of
the query cache key, so Convex won't expose it there). `session.signIn` and
`signup.signUpWithInvitation` are both mutations, so it's available exactly
where sessions are minted.

That's why this feature needs **no HTTP route and no CORS setup**. Earlier
designs assumed a Convex WS mutation had no request context and that the IP
would need a `publicRoute` (Hono, `c.req.header(...)`) or a Cloudflare Worker
hop — obsolete. Nothing about IP/UA travels over the wire from the client.

kitcn doesn't interfere: `MutationCtx = GenericOrmCtx<ServerMutationCtx, schema>`
and `GenericOrmCtx<Ctx, T> = Ctx & { orm }`, while at runtime kitcn's context
wrapping is object spreading and `meta` is an enumerable own property.

⚠️ `getRequestMetadata()` also returns `authToken` — a **raw JWT**. Always
destructure the fields you want; never `console.log` the whole object.

#### Trust model — the IP is telemetry, never authorization

Convex derives `ip` from the **leftmost** `x-forwarded-for` entry (falling back
to the raw TCP peer). The edge in front of a deployment _appends_ to that header
rather than replacing it, so a caller that sends its own `X-Forwarded-For` can
decide what gets recorded.

**Never gate authorization, bans, geo-restrictions, or rate limits on the
stored IP.** It's an audit hint for a human reading the table. Real IP-based
controls belong at the edge (Cloudflare WAF / rate-limiting rules).

Also: on the WebSocket transport the IP is sampled at **connection time** and
stays frozen for the life of the socket, and Convex truncates what it returns
(IP at 256 bytes, UA at 512) so no extra length validation is needed. All of
this is restated next to the schema in `shared/tables/session.ts`.

#### Liveness (`lastSeenAt`) — why it's a heartbeat and nothing else

`session.heartbeat` (`authMutation.requires(USER_ROLES)`) is the **only** writer
of `lastSeenAt`. It cannot be maintained on ordinary authenticated traffic:
Convex queries can't write (`QueryCtx.db` is a reader), and nearly all
authenticated traffic here is queries — `session.me` is a standing subscription
and every list page is a query. Piggybacking on authenticated _mutations_ was
considered and rejected: a user who only browses would never bump it, making
the column actively misleading.

Two throttles keep it cheap:

- **Client** (`packages/app-convex/src/use-heartbeat.ts`, `useSessionHeartbeat`):
  fires on mount, then every `HEARTBEAT_INTERVAL_MS` (5 min), and **only while
  the tab is visible**. Becoming visible again pings immediately instead of
  waiting out the interval. A backgrounded tab pinging forever would turn "last
  seen" into "last had a tab open".
- **Server**: skips the write entirely when the stored value is newer than
  `LAST_SEEN_THROTTLE_MS` (1 min). This is what stops N open tabs from writing
  the same row every tick and contending under Convex's OCC. The check reads
  `ctx.session.lastSeenAt`, which the auth middleware already loaded, so the
  skipped path costs no extra read and no write.

The hook is called from **both** apps' `routes/_authenticated.tsx`. Those two
files are byte-identical except for the role literal — mirror any edit into
both in the same commit.

The heartbeat is fire-and-forget and swallows errors: a ping that fails because
the session was just revoked must not throw into the layout.

⚠️ The hook holds the cRPC client in a **ref** and keys its effect on the token
alone. `useCRPCClient()` returns a fresh `Proxy` on every render whenever the
context was built with `convexSiteUrl` (it is), so putting it in the dependency
array would rebuild the timer — and fire a heartbeat round-trip — on every
render of the layout.

#### `ctx.session` — injected by the auth middleware

`resolveSession` in `convex/lib/crpc.ts` already reads the session row to
authorize the call, so it injects `ctx.session = { id, lastSeenAt }` alongside
`ctx.user`. Two downstream procedures rely on it and therefore avoid a second
lookup by token:

- `heartbeat` patches by `ctx.session.id` and throttles on `ctx.session.lastSeenAt`
- `revokeAllForUser` excludes `ctx.session.id`

The middleware also rejects non-`active` sessions with per-status Chinese
messages, so a kicked user is told they were terminated rather than that they
simply expired.

#### Revocation (踢下线)

- `session.revoke` (`authMutation.requires(["admin"])`) — one session →
  `revoked` + `endedAt` + `revokedBy`. `BAD_REQUEST` on a non-`active` source
  status, `NOT_FOUND` if absent (mirrors `invitations.revoke`).
- `session.revokeAllForUser` — every live session of one user, returning
  `ok({ revoked: n })`.

Both refuse **already-expired** rows (status still `active`, past `expiresAt`):
they're dead anyway, and stamping `revokedBy` on one would claim an admin ended
something that lapsed on its own. `revoke` throws `该会话已过期`;
`revokeAllForUser` skips them. This matches the UI, where `isRevocable`
disables the button for expired rows.

**`revokeAllForUser` always excludes the caller's own current session.** An
admin using it on their own account means "sign out my other devices", not
"lock me out"; when the target is someone else the exclusion never matches, so
it costs nothing. The dialog says so when the target is you.

Capped at `SESSION_REVOKE_BATCH_MAX` (200) per call — Convex mutations are
bounded transactions — and the response reports what it actually revoked rather
than implying the account is fully drained.

⚠️ **`orderBy: { createdAt: "desc" }` on that query is load-bearing, not
cosmetic.** kitcn compiles a bare `eq(userId, …)` to `withIndex(...).take(n)`
with Convex's default **ascending** order, so without it the cap would select
the user's _oldest_ rows. Since rows are never deleted, any long-lived account
accumulates ended sessions and the live ones — always newest — would fall
outside the window, making 全部踢下线 silently revoke nothing while reporting
success. The same reasoning applies to the `users.list` summary below.

`listByUser` also returns `isCurrent` per row (derived from `ctx.session.id`,
never from the token) so the UI can tag the admin's own session 本机 and warn
in the confirm dialog before they kick themselves.

**The victim's browser bounces on its own.** `session.me` is a live Convex
subscription, so flipping `status` makes it re-run, throw `UNAUTHORIZED`, and
trip the existing `_authenticated` gate (which clears the stale token and
redirects to `/auth`). No heartbeat and no polling involved — expect the kicked
tab to leave within a second or two.

This only works because `useSession` gates on `query.isError`. **TanStack Query
keeps the last successful `data` when a refetch fails**, so reading
`query.data?.data?.user` alone would hand back the stale user forever and an
already-open tab would stay signed in until a full reload. Don't remove that
check.

#### Read path — admin procedures

- `users.list` / `users.count` / `users.get` (`functions/users.ts`)
- `session.listByUser` / `session.countByUser` (`functions/session.ts`)

All `authQuery.requires(["admin"])`, all offset-paginated with the
`pageSize + 1` look-ahead, mirroring `functions/invitations.ts`.

🔒 **`session.listByUser` never projects `token`.** Returning the bearer
credential to the dashboard would let anyone with admin access impersonate any
signed-in user. The `columns` projection lists fields explicitly for this
reason; don't "simplify" it into a full-row read.

Two deliberate non-obvious choices:

- **`users.list` runs one INDEX-BACKED query per listed user** for its session
  summary, not a single `inArray(userId, …)` batch. That distinction matters:
  kitcn compiles `inArray` on an indexed field to a "multiProbe" strategy that
  `collect()`s **every** matching row per id and only then slices to the
  requested `limit` — so the `limit` is a post-fetch slice, not a read bound,
  and against an append-only table the read grows without bound (and truncates
  in probe order, starving later users of a summary entirely). `eq(userId, …)`
  with a `limit` compiles to `withIndex(...).take(n)`, which is a genuine cap:
  `SESSION_SUMMARY_SCAN_PER_USER` (200) newest rows per user, `pageSize` capped
  at 100. Using `count()` instead would need an `aggregateIndex` per
  `(userId, status)` and still couldn't express "active AND not expired", which
  is a comparison against the current time.
- **`session.countByUser` is a capped id scan, not `count()`.** kitcn's
  `count({ where })` only accepts an `AggregateNoScanWhereArg` — it _requires_
  an `aggregateIndex`. That was avoided on purpose: the aggregate would have to
  be maintained on every session write, and `heartbeat` makes writes to this
  table the hottest path in the app. The scan stops at
  `SESSION_COUNT_SCAN_MAX` (1000) and returns `capped` so the pager renders
  "N+" instead of silently under-reporting.

#### Frontend — `apps/dashboard/src/routes/_authenticated/users/`

Every procedure behind these pages is admin-only, so both routes talk to
`useAuthedCRPC()` exclusively — `sessionToken` is injected at the boundary and
erased from the argument types, so it never appears at a call site (see
[auth](auth.md)).

```
index.tsx                                用户列表
-components/users-table.tsx
-lib/pagination.ts                       useOffsetPagination + toAntdPagination
-lib/format.tsx                          日期 / IP / UA 单元格渲染
-model/pagination.ts                     分页 reducer
-model/user-row.ts
-model/session-row.ts                    含 resolveDisplayStatus / isRevocable
$userId/index.tsx                        用户详情 + 会话表 + 全部踢下线
$userId/-components/user-sessions-table.tsx
$userId/-components/session-status-badge.tsx
$userId/-components/revoke-session-dialog.tsx
$userId/-components/revoke-all-dialog.tsx
```

`$userId/` is nested inside the `users/` slice and shares the parent's `-lib/`
and `-model/` — the same pattern as `_public/-lib/zod-rule.ts` being shared by
routes under `_public`.

Details worth not breaking:

- `Date.now()` is read **inside** the status column's render function, not
  hoisted into the `useMemo`. The columns array is built once, so a hoisted
  timestamp would freeze at mount and a session expiring while the page sits
  open would keep rendering as 活跃.
- `useOffsetPagination` clamps `pageIndex` **on read** against the live total,
  so a total that shrinks under an admin sitting on the last page doesn't leave
  the table querying a dead offset.
- The UA cell is `Typography.Text ellipsis` inside a `Tooltip` — **no UA parsing
  library**; the raw string is what an auditor wants.
- Sidebar entry: 用户 → `/users`.

#### Schema-change procedure

`lastSeenAt` / `endedAt` / `revokedBy` are optional → no migration (see
`docs/MIGRATION.md`).

`status` is the exception and is currently **still nullable** with a
`?? DEFAULT_SESSION_STATUS` fallback in `lib/crpc.ts`, `functions/session.ts`
and `functions/users.ts`, plus a `TODO(migration)` in `schema.ts`. The
`20260816_234850_backfill_session_status` migration sets `active` on
pre-existing rows (every row that survived the old delete-on-sign-out design
was by definition active). It has been run against dev. **Harden the column to
`.notNull()` and delete the `??` fallbacks only after the backfill has run
against production** — that's the second half of `docs/MIGRATION.md`'s
required-field flow, and it must be triggered manually because this repo has no
CI workflow.

#### Known limitations

- **Nothing prunes the table.** Rows are never deleted by design, so `session`
  grows monotonically. A retention cron is a reasonable follow-up.
- **No failed-login record.** Failed attempts arrive on an unauthenticated
  write path; recording them without rate limiting in front would let anyone
  inflate the table.
- Convex module paths can't contain hyphens (the backend rejects them at push
  time with `InvalidConfig`, even though the bundler and codegen tolerate them),
  which constrains file naming under `convex/functions/` only.
