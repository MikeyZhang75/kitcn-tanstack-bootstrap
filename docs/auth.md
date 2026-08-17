### Auth flow (custom session tokens — no Better Auth, no JWT)

This project runs its **own** user system. There is no Better Auth, no
`@convex-dev/better-auth`, no JWT, and no JWKS. Identity is a single opaque
**session token** the client holds in `localStorage` and sends to the backend
as a procedure argument. kitcn's auth runtime is intentionally **disabled** (no
`convex/functions/auth.ts`), so `generated/auth.ts` is the `createDisabledAuthRuntime`
stub — never call `getAuth`/`auth.*`.

#### Why session tokens (and why the whole app is client-rendered)

The goal was a client-side app that keeps its credential in `localStorage`
(not an httpOnly cookie), so auth no longer depends on SSR/HTTP cookie
plumbing. Two consequences:

- **Token as a procedure argument.** Convex authenticates real-time
  WS queries/mutations _only_ via `ctx.auth.getUserIdentity()`, which requires
  a JWT verified against a configured provider. With no JWT there is no
  Convex-native channel for an opaque token, so every authenticated procedure
  receives `sessionToken` in its input and validates it against the `session`
  table. The cRPC builders merge this field in automatically (below).
- **SPA mode (the whole app renders on the client).** localStorage doesn't
  exist during SSR, so the route gate can't run server-side. Both apps enable
  TanStack Start **`spa` mode** via `tanstackStart({ spa: { enabled: true } })`
  in `@repo/vite-preset`, so every route renders on the client. SPA mode
  prerenders a single static shell (root route → `dist/client/_shell.html`) at
  build time; because the apps deploy to Cloudflare **Workers** via
  `@cloudflare/vite-plugin`, that prerender runs **in-process** (miniflare /
  workerd) — no spawned `wrangler pages dev` — so it builds in plain CI / the
  sandbox. (History: the earlier Cloudflare **Pages** setup — `nitro({ preset:
"cloudflare-pages" })` — could **not** build `spa` mode: Nitro's preview
  runner spawned `npx wrangler pages dev --host …`, but `wrangler pages dev`
  only accepts `--ip`, so the preview server never started and the prerender
  timed out. Moving to the `@cloudflare/vite-plugin` Workers setup fixed it.)
  Both layouts (`_authenticated` **and** `_public`) also set `ssr: false` as a
  fallback: drop the `spa` flag and the app still renders client-side with no
  prerender, with the `_authenticated` gate and the `/auth` "bounce
  already-signed-in visitors" check reading localStorage in `beforeLoad` on hard
  loads.

#### Storage model

Five tables in `schema.ts` (all plain app tables — kitcn manages none of them):

- `user` — `username` (unique, lowercased login handle), `name` (display), `role`.
- `credentials` — `userId` (unique FK → user), `passwordHash`, plus nullable
  `passwordUpdatedAt` / `passwordUpdatedBy` (password-change audit; the acting
  admin for a forced reset, the user themselves for a self-service change).
  Kept separate from `user` so user projections never carry the hash. It
  declares **no explicit index**: `.unique()` on `userId` already materialises
  `credentials_userId_unique`, so the by-userId lookups are index-backed and
  adding `index("userId")` would just double the write cost.
- `session` — `token` (unique, 64 hex chars), `userId` (FK → user), `status`
  (`active` | `signed_out` | `revoked` | `password_changed`), `expiresAt`, plus
  nullable `lastSeenAt` / `endedAt` / `revokedBy` / `ipAddress` / `userAgent`.
  **Rows are never deleted** — sign-out, admin revocation, and a password change
  all flip `status`, which is what makes this table the login audit trail.
  `status` + `expiresAt` are the source of truth; there is nothing to
  cryptographically verify. `ipAddress` / `userAgent` come from `ctx.meta.getRequestMetadata()`
  at mint time and are **audit telemetry only** (the IP is client-spoofable);
  `lastSeenAt` is written solely by the `session.heartbeat` mutation. Full
  model in [session audit](feature-session-audit.md).
- `invitations` — unchanged (see [feature-invitations](feature-invitations.md)).
- `settings` — a single-row (singleton) `requireInvitationCode: boolean()`
  holding the global signup gate. The row is absent until an admin first toggles
  it; reads default to `true` (`DEFAULT_REGISTRATION_SETTINGS` in
  `shared/tables/settings.ts`). Admins flip it from the dashboard `/settings`
  page; `signUpWithInvitation` reads it to decide whether a code is required.

Password hashing lives in `convex/lib/password.ts`: **scrypt via
`@noble/hashes`** (pure JS, runs in the Convex V8 isolate), salt from
`crypto.getRandomValues`, stored as a self-describing PHC-style string
(`scrypt$N$r$p$saltHex$hashHex`). Both the salt and the session token
(`convex/lib/session-token.ts`) come from `crypto.getRandomValues`, which is
available and deterministically seeded in the Convex runtime — so hashing and
token minting run **inline in mutations**, no action hop. `verifyPassword`
reads the parameters back from the stored string (so raising `N` only affects
new hashes) and compares in constant time.

#### Procedures

- `convex/functions/session.ts`:
  - `signIn` (`publicMutation`, input `signInInputSchema`) — find user by
    lowercased username, verify password, mint a session row via
    `lib/create-session.ts`, return `ok({ sessionToken })`. A single generic
    `用户名或密码错误` on any failure.
  - `signOut` (`publicMutation`, input `signOutInputSchema`) — **updates**
    `status` to `signed_out` (+ `endedAt`); it does not delete the row. Only
    `active` rows transition, so it stays idempotent and a late sign-out can't
    overwrite an admin's `revoked` record.
  - `heartbeat` (`authMutation.requires(USER_ROLES)`) — the only writer of
    `lastSeenAt`, called by the client on an interval. Server-side throttled.
  - `me` (`authQuery.requires(USER_ROLES)`) — returns `ok({ user })` for the
    current identity. The **only** place the frontend asks the backend "who am
    I", used by the route gate + sidebar user menu.
  - `listByUser` / `countByUser` (`authQuery.requires(["admin"])`) — one user's
    sessions for the dashboard. `listByUser` **never projects `token`**.
  - `revoke` / `revokeAllForUser` (`authMutation.requires(["admin"])`) — 踢下线.
    `revokeAllForUser` always excludes the calling admin's own session.
  - See [session audit](feature-session-audit.md) for all of the above.
- `convex/functions/account.ts` — `changePassword`
  (`authMutation.requires(USER_ROLES)`), the self-service path. See 密码管理
  below.
- `convex/functions/users.ts` — besides `bootstrapAdmin` (below), `list` /
  `count` / `get` (`authQuery.requires(["admin"])`) back the dashboard `/users`
  page, and `resetPassword` (`authMutation.requires(["admin"])`) is the admin
  force-reset. `get` also projects the target's `passwordUpdatedAt` /
  `passwordUpdatedBy` (resolved to a username) for the detail header — never
  `passwordHash`.
- `convex/functions/signup.ts` — `signUpWithInvitation` (`publicMutation`):
  one atomic transaction creates the user + credential, mints a session (same
  `createSession` helper), and returns `ok({ sessionToken })` (the client is
  signed in immediately — no separate sign-in round trip). Whether an invitation is required is the live
  `settings.requireInvitationCode` flag (default `true`): when on it validates
  and consumes an `active` code (missing/used/revoked → `BAD_REQUEST`); when an
  admin has opened registration the `invitationCode` input is ignored. The
  input schema's `invitationCode` is therefore `.optional()` — presence is
  enforced in the body, not the validator.
- `convex/functions/settings.ts`:
  - `getRegistrationSettings` (`publicQuery`, no input) — returns
    `ok({ requireInvitationCode })`. **Public** so the unauthenticated web signup
    form can read it to show/require the invitation field (only this one
    non-sensitive boolean is exposed); the dashboard `/settings` page reuses the
    same query. Defaults when the singleton row is absent.
  - `setRequireInvitationCode` (`authMutation.requires(["admin"])`, input
    `setRequireInvitationCodeInputSchema`) — upserts the singleton (update the
    row or insert the first). Convex OCC retries guard against duplicate
    singleton rows on a concurrent first write.
- `convex/functions/users.ts` — `bootstrapAdmin` (`privateMutation`), cold-start
  (below).

#### 密码管理 (password management)

Two procedures, deliberately separate because they have different
authorization and different proof requirements.

**`account.changePassword`** (`authMutation.requires(USER_ROLES)`, input
`changePasswordInputSchema`) — the signed-in user changes their own.

- **The current password is required.** Not generic hygiene: the session token
  is a bearer credential in `localStorage` with a 30-day _absolute_ TTL, there
  is no re-authentication or auth-recency signal anywhere in the app, and there
  is no email / reset flow / second factor to recover through. Without the
  proof, possession of a lifted token converts into permanent ownership of the
  account, unrecoverably.
- The target is always `ctx.user.id`. It is **never** an input field — an
  input-supplied target on a `requires(USER_ROLES)` procedure is a
  horizontal-privilege-escalation hole.
- Body order matters and is deliberate: read the credential → `verifyPassword`
  (bail here, so a wrong guess costs **one** scrypt run rather than two) →
  reject `newPassword === currentPassword` by **plaintext** comparison (the
  previous step already proved the current one, so a third scrypt run would buy
  nothing) → `hashPassword` → write → _then_ end the other sessions.
- Ending the other sessions is last on purpose: it establishes the OCC read set
  over the hot `session` table (which `heartbeat` writes to), and a conflict
  retry re-runs the whole mutation including both hashes.
- Wrong current password is `BAD_REQUEST "当前密码错误"`, **not**
  `UNAUTHORIZED` — that code is reserved for a dead session and the frontend
  reads it that way. Naming the wrong field leaks nothing here: the caller is
  already authenticated as that exact account, so `signIn`'s deliberately vague
  message (which avoids handing an _anonymous_ caller a username oracle) has no
  analogue.

**`users.resetPassword`** (`authMutation.requires(["admin"])`, input
`resetPasswordInputSchema`) — an admin force-sets someone else's.

- **Self-target is rejected** (`BAD_REQUEST "请通过「修改密码」修改自己的密码"`),
  and that rejection _is_ the security boundary. This path by design requires no
  proof of the current password (an admin doesn't have it), so allowing it
  against your own account would be a one-call bypass of `changePassword`'s
  requirement above for anyone holding a stolen admin token.
- The admin supplies the new password; the server does **not** generate one. A
  generated plaintext would travel back in the cRPC response and land in the
  TanStack Query cache and devtools.
- Any role may be targeted, another admin included. ⚠️ Known accepted risk:
  there is no role hierarchy, no super-admin, no protected account, and
  `bootstrapAdmin` refuses to run once any admin exists — so one compromised
  admin token escalates to every admin account with no in-app recovery. The
  mitigation is attribution, not prevention (`passwordUpdatedBy` + the
  `revokedBy`-stamped session rows).

**Session termination** is mandatory for both, and is the only invalidation
channel that exists: `resolveSession` never consults `credentials`, and there is
no password version or token derivation linking a session to a password. Without
it a stolen token keeps authorizing every call for the rest of its 30-day TTL —
i.e. the exact action someone takes on suspected compromise would do nothing.

- Self-service ends **every** session of the account — including the caller's
  own — and then mints a replacement via `createSession`, returning the fresh
  token. It writes no `revokedBy`. The returned `revokedSessions` count excludes
  the caller's own session, so the UI can honestly say 「其他 N 个设备」.

  ⚠️ **Rotating the caller's own token is the point, not an optimisation.**
  Sparing that row would spare the single most valuable credential in the
  system: the token string sitting in that browser's `localStorage`, which is
  precisely what an XSS payload or a minute at an unlocked machine walks away
  with. A copy of it authenticates as that session for the rest of the 30-day
  TTL, and "I changed my password" would not touch it — defeating the control
  for the one device the victim is remediating from. It still means
  「当前设备保持登录」: the device stays signed in, just on a new credential.

  ⚠️ The client's `onSuccess` must call `setSessionToken(...)` **first, before
  anything else**. Convex delivers the mutation's result and the `session.me`
  UNAUTHORIZED in the same React batch (`removeCompleted` only resolves a
  mutation once the query set has advanced past its timestamp), so swapping the
  token first re-keys `session.me` to `isPending` and the `_authenticated`
  gate's "token present but no user" cleanup never fires. Reorder it and the tab
  bounces to `/auth` right after a successful password change.

- An admin reset ends **all** of the target's sessions, including their live
  tab, stamped with `revokedBy`, and mints nothing — the target signs in again
  with the new password.
- Both write `status: "password_changed"` and go through
  `lib/end-user-sessions.ts` — the one place that owns the load-bearing
  `orderBy: { createdAt: "desc" }`, the skip-expired guard, and the
  `SESSION_REVOKE_BATCH_MAX` cap. `session.revokeAllForUser` uses it too. See
  [session audit](feature-session-audit.md).

**Neither input schema carries a top-level `.refine()`, and neither should.** It
would run — zod 4's `.refine()` returns the same `ZodObject`, so kitcn's
`.shape`-based input merge is unaffected, and `docs/version-bumps.md`'s old
claim to the contrary is wrong — but kitcn's `parseInput` throws
`ConvexError({ ZodError })` from _outside_ the handler's try block, bypassing the
error normalizer; `normalizeError` then finds no `code`/`message` and degrades to
a generic 「出现错误」 toast, breaking the `{ code, message, data? }` envelope. A
schema carrying checks also can't be `.extend()`/`.omit()`/`.merge()`d
afterwards. Cross-field rules go in the procedure body; the confirm-password
field is form-only and is not declared in `.input()` at all.

Frontend: `apps/*/src/components/change-password-dialog.tsx` (byte-identical in
both apps, opened from the `nav-user.tsx` user menu) and
`apps/dashboard/src/routes/_authenticated/users/$userId/-components/reset-password-dialog.tsx`.

#### Authorization (cRPC builders)

`convex/lib/crpc.ts` is the sole authorization model. `authQuery.requires([...])`
/ `authMutation.requires([...])` each `.input(z.object({ sessionToken }))` (so
Convex's strict arg validator accepts the token) then `.use(...)` middleware
calls `resolveSession`: look the token up in `session`; reject if missing, if
`status` is no longer `active`, or if past `expiresAt` (all `UNAUTHORIZED`);
load the user; enforce the allowed roles (`FORBIDDEN`); and inject `ctx.user`
(`{ id, username, name, role }` — there is no `ctx.userId`, use `ctx.user.id`)
plus `ctx.session` (`{ id, lastSeenAt }`, reused by `heartbeat` and
`revokeAllForUser` so neither re-queries by token). All reads, no `ctx.auth`.
The roles tuple
is typed `readonly [UserRole, ...UserRole[]]` so `.requires([])` is a compile
error, and forgetting `.requires(...)` is too (`authMutation` has only
`.requires`, not `.input`).

⚠️ **The status check is an ALLOW-list — `if (status !== "active")` plus the
exhaustive `SESSION_ENDED_MESSAGES` record — and must stay one.** It used to be
a chain of `=== "revoked"` / `=== "signed_out"` tests, which meant any status
added later fell straight through and remained a fully valid credential, with no
TypeScript error anywhere. As written, adding a `SESSION_STATUSES` member fails
to compile until the message map covers it. `session.revoke`'s "this session
already ended" message uses the same trick
(`SESSION_ALREADY_ENDED_MESSAGES`) for the same reason.

`publicQuery`/`publicMutation`/`publicAction`, `privateQuery`/`privateMutation`/
`privateAction` (`.internal()`), and `publicRoute` (HTTP) round out the set.
There is **no `authAction`/`authRoute`** — authenticated HTTP/action procedures
aren't supported in the session-token model (a WS query/mutation reads the
token from its input; an HTTP route would have to parse it from a header and
resolve the session via an internal caller). Nothing needs that today.

In particular, **recording a client's IP does not need one.** Convex exposes
`ctx.meta.getRequestMetadata()` on mutations and actions (not queries), so
sign-in / sign-up read the IP and User-Agent straight off the context. See
[session audit](feature-session-audit.md) before reaching for `publicRoute`.

`USER_ROLES`, `UserRole`, and the input schemas (`signInInputSchema`,
`signUpWithInvitationInputSchema`, `bootstrapAdminInputSchema`,
`listUsersInputSchema`, `getUserInputSchema`, `changePasswordInputSchema`,
`resetPasswordInputSchema`) live in
`packages/backend/convex/shared/tables/user.ts`; session constants
(`SESSION_TTL_MS`, `SESSION_STATUSES`, `SESSION_STATUS_LABELS`,
`SESSION_ENDED_MESSAGES`, `SESSION_ALREADY_ENDED_MESSAGES`,
`HEARTBEAT_INTERVAL_MS`, `LAST_SEEN_THROTTLE_MS`, `sessionTokenSchema`, and the
`signOut` / list / revoke input schemas) in `shared/tables/session.ts` — which
is also where the IP/User-Agent trust caveats are written down. All three
modules (`user.ts`, `invitations.ts`, `session.ts`) are imported directly by
the frontend for form rules, row types, status labels, and the heartbeat
interval.

#### Frontend (shared `packages/app-convex`)

- `session-store.ts` — `getSessionToken` / `setSessionToken` / `clearSessionToken`
  over `localStorage` (key `app.session_token`) + `subscribeSessionToken` (custom
  same-tab event + cross-tab `storage` event).
- `use-session-token.ts` — `useSessionToken()` (`useSyncExternalStore`,
  reactive). Its own module rather than part of `use-session.ts` because
  `use-authed-crpc.ts` needs it and `use-session.ts` consumes _that_ — splitting
  it is what breaks the import cycle.
- `use-session.ts` — `useSession()` (runs `session.me` through the authed proxy)
  returning `{ sessionToken, user, isPending, isAuthenticated }`.
- `use-auth.ts` — `useSignIn` / `useSignUp` (store the returned token on success)
  and `useSignOut` (revoke via the vanilla cRPC client, then clear the token).
  These replace the old per-app `auth-client.ts` (deleted). `web` uses all three;
  `dashboard` uses sign-in + sign-out (no self-signup).
- `use-heartbeat.ts` — `useSessionHeartbeat()`, called from both apps'
  `_authenticated` layout. Pings `session.heartbeat` on an interval while the
  tab is visible; the only thing that maintains `session.lastSeenAt`. Uses the
  vanilla cRPC client (like `useSignOut`), so it threads the token itself —
  the authed proxy wraps the options proxy, not the vanilla client. See
  [session audit](feature-session-audit.md).
- `use-authed-crpc.ts` + `authed-crpc-proxy.ts` — **how authed call sites get
  the token.** See below.

##### `useAuthedCRPC()` — the token never appears at a call site

`sessionToken` is a transport detail of the auth builders, not something route
code should re-spread into every argument object. `useAuthedCRPC()` returns the
same cRPC proxy with the token injected at the boundary and the field **erased
from the argument types**:

```tsx
const authed = useAuthedCRPC();
useQuery(authed.invitations.list.queryOptions({ page, pageSize })); // no token
const revoke = useMutation(authed.invitations.revoke.mutationOptions());
revoke.mutate({ id }); // no token
```

- **Types** (`use-authed-crpc.ts`): `StripSessionToken<Api>` walks the generated
  api and rebuilds each `FunctionReference` with `sessionToken` dropped from
  `_args`; the result is fed back through kitcn's own `CRPCClient` mapping, so
  the decorators stay in lock-step with the installed kitcn. It must **rebuild**
  the reference via `infer` — `Omit<leaf, "_args">` collapses to a bare index
  signature (kitcn's leaf meta carries `[key: string]: unknown`, so `keyof leaf`
  is `string | number`), which erases `_type` and makes the leaf map to `never`.
- **Runtime** (`authed-crpc-proxy.ts`): a recursive `Proxy` that injects the
  token into the args of `queryOptions` / `staticQueryOptions` /
  `infiniteQueryOptions` / `queryKey` / `queryFilter` / `infiniteQueryKey`, and
  wraps `mutationOptions`'s `mutationFn` (wrapping the fn — rather than
  pre-binding args — keeps the `variables` handed to `onMutate` / `onSuccess` /
  `onError` equal to what the caller passed to `.mutate()`). `skipToken` passes
  through untouched. Signed out, query options come back `enabled: false`, which
  is what replaced the hand-written `enabled: sessionToken != null` guards.
  Dispatch is **by method name, not `typeof`**: kitcn builds its tree as
  `new Proxy(() => {}, …)`, so intermediate namespace nodes also report as
  `"function"`.
- **Public procedures keep using plain `useCRPC()`.** Convex validates procedure
  args strictly, so injecting `sessionToken` into a public procedure's input is
  a runtime error — and nothing at runtime can tell the two apart (kitcn's
  generated leaves only carry `{ type }` meta; the `auth` field comes from
  kitcn's auth runtime, which is disabled here). `dashboard`'s `/settings` is
  the canonical example of a page holding both: `crpc` for the public
  `settings.getRegistrationSettings` read, `authed` for the admin-only
  `settings.setRequireInvitationCode` write.

Each frontend app accepts **exactly one role**: `apps/web` allows only
`role === "user"`, `apps/dashboard` only `role === "admin"`. Every other role
lands on `/access-denied`. Separating by app keeps each `_authenticated`
subtree scoped to a single audience.

#### Session gate (client-side)

- `_authenticated.tsx` is `ssr: false`. Its `beforeLoad` does a cheap,
  flash-free token-presence check (`getSessionToken()` — runs on the client, so
  localStorage is available) and redirects to `/auth?callbackUrl=…` when there's
  no token. The **authoritative role check** is in the layout component via
  `useSession()`: while `me` is pending it renders a spinner; if `me` resolves
  to no user the token is stale/expired/revoked → an effect clears it and it
  redirects to `/auth`; on role mismatch → `/access-denied`; otherwise the
  shell renders. Because `me` is a live Convex subscription, a server-side
  sign-out / session deletion re-runs the query and bounces the user
  automatically.
- `_public/auth.tsx`'s `beforeLoad` bounces already-signed-in visitors (token
  present) to `/`; a stale token resolves in at most one bounce (the authed
  gate clears it). After auth success, **full-page navigation** with
  `window.location.assign(...)` so the router rebuilds with the token already in
  localStorage.
- `/access-denied` (`apps/*/src/routes/_public/access-denied.tsx`): a
  `ShieldAlert` card with a "退出登录" button wired to `useSignOut`. We do **not**
  auto-sign-out on landing — the user chooses.

#### Cold-start: minting the first admin

Signup always creates a `role: "user"`, and `invitations.create` requires an
existing admin — a chicken-and-egg. Break it by running `users:bootstrapAdmin`
once against a clean deployment from the operator shell:

```bash
cd packages/backend

# Dev (reads .env.local)
bunx convex run users:bootstrapAdmin '{"username":"alice","password":"<pw>"}'

# Prod (Convex Cloud)
CONVEX_DEPLOY_KEY='prod:<name>|<token>' \
  bunx convex run users:bootstrapAdmin '{"username":"alice","password":"<pw>"}' --prod

# Prod (self-hosted)
bunx convex run users:bootstrapAdmin '{"username":"alice","password":"<pw>"}' --env-file .env.prod
```

It hashes the password and inserts the `user` (role `admin`) + `credentials`
rows directly. Then sign in on the dashboard (whatever `VITE_SITE_URL` you
wired for `apps/dashboard`, or `https://dashboard.localhost` in dev) with the
same username and password.

Safety net: `bootstrapAdmin` refuses to run if any admin already exists
(returns `CONFLICT`). Promote subsequent admins via the Convex dashboard (edit
the user row's `role`); add a follow-up internal mutation if it becomes
recurring.
