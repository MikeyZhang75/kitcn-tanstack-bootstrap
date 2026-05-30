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
- **SPA mode + `ssr: false` fallback (the whole app renders on the client).**
  localStorage doesn't exist during SSR, so the route gate can't run
  server-side. Both apps enable TanStack Start **`spa` mode** via
  `tanstackStart({ spa: { enabled: true } })` in `@repo/vite-preset`, so every
  route renders on the client. ⚠️ **Build caveat:** `spa` mode force-enables a
  build-time shell prerender (root route → `/_shell.html`) that runs the
  `cloudflare-pages` Nitro preset's preview command, `npx wrangler pages dev` —
  so the build needs a working wrangler/workerd and **fails where it can't
  boot** (e.g. a CI runner / sandbox without it). If that bites, the clean fix
  is migrating the deploy off Cloudflare Pages to Cloudflare **Workers** via
  `@cloudflare/vite-plugin`, where the shell prerender runs in-process. Both
  layouts (`_authenticated` **and** `_public`) also set `ssr: false` as a
  fallback: drop the `spa` flag and the app still renders client-side with no
  prerender (the Nitro worker SSRs only the bare document shell), with the
  `_authenticated` gate and the `/auth` "bounce already-signed-in visitors"
  check reading localStorage in `beforeLoad` on hard loads.

#### Storage model

Four tables in `schema.ts` (all plain app tables — kitcn manages none of them):

- `user` — `username` (unique, lowercased login handle), `name` (display), `role`.
- `credentials` — `userId` (unique FK → user), `passwordHash`. Kept separate
  from `user` so user projections never carry the hash.
- `session` — `token` (unique, 64 hex chars), `userId` (FK → user), `expiresAt`.
  The row's existence + `expiresAt` is the source of truth; there is nothing to
  cryptographically verify.
- `invitations` — unchanged (see [feature-invitations](feature-invitations.md)).

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
    lowercased username, verify password, mint a session row, return
    `ok({ sessionToken })`. A single generic `用户名或密码错误` on any failure.
  - `signOut` (`publicMutation`, input `signOutInputSchema`) — delete the
    session row by token; idempotent.
  - `me` (`authQuery.requires(USER_ROLES)`) — returns `ok({ user })` for the
    current identity. The **only** place the frontend asks the backend "who am
    I", used by the route gate + sidebar user menu.
- `convex/functions/signup.ts` — `signUpWithInvitation` (`publicMutation`):
  one atomic transaction validates the invitation, creates the user +
  credential, consumes the invitation, mints a session, and returns
  `ok({ sessionToken })`. The client is signed in immediately — no separate
  sign-in round trip.
- `convex/functions/users.ts` — `bootstrapAdmin` (`privateMutation`), cold-start
  (below).

#### Authorization (cRPC builders)

`convex/lib/crpc.ts` is the sole authorization model. `authQuery.requires([...])`
/ `authMutation.requires([...])` each `.input(z.object({ sessionToken }))` (so
Convex's strict arg validator accepts the token) then `.use(...)` middleware
calls `resolveSessionUser`: look the token up in `session`, reject if
missing/expired (`UNAUTHORIZED`), load the user, enforce the allowed roles
(`FORBIDDEN`), and inject `ctx.user` (`{ id, username, name, role }` — there is
no `ctx.userId`, use `ctx.user.id`). All reads, no `ctx.auth`. The roles tuple
is typed `readonly [UserRole, ...UserRole[]]` so `.requires([])` is a compile
error, and forgetting `.requires(...)` is too (`authMutation` has only
`.requires`, not `.input`).

`publicQuery`/`publicMutation`/`publicAction`, `privateQuery`/`privateMutation`/
`privateAction` (`.internal()`), and `publicRoute` (HTTP) round out the set.
There is **no `authAction`/`authRoute`** — authenticated HTTP/action procedures
aren't supported in the session-token model (a WS query/mutation reads the
token from its input; an HTTP route would have to parse it from a header and
resolve the session via an internal caller). Nothing needs that today.

`USER_ROLES`, `UserRole`, and the input schemas (`signInInputSchema`,
`signUpWithInvitationInputSchema`, `bootstrapAdminInputSchema`) live in
`packages/backend/convex/shared/tables/user.ts`; session constants
(`SESSION_TTL_MS`, `sessionTokenSchema`, `signOutInputSchema`) in
`shared/tables/session.ts`. Both are imported directly by the frontend.

#### Frontend (shared `packages/app-convex`)

- `session-store.ts` — `getSessionToken` / `setSessionToken` / `clearSessionToken`
  over `localStorage` (key `app.session_token`) + `subscribeSessionToken` (custom
  same-tab event + cross-tab `storage` event).
- `use-session.ts` — `useSessionToken()` (`useSyncExternalStore`, reactive) and
  `useSession()` (runs `session.me` with the token; `enabled` only when a token
  exists) returning `{ sessionToken, user, isPending, isAuthenticated }`.
- `use-auth.ts` — `useSignIn` / `useSignUp` (store the returned token on success)
  and `useSignOut` (revoke via the vanilla cRPC client, then clear the token).
  These replace the old per-app `auth-client.ts` (deleted). `web` uses all three;
  `dashboard` uses sign-in + sign-out (no self-signup).
- Authed call sites thread the token: `crpc.X.queryOptions({ ...args, sessionToken })`.

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
