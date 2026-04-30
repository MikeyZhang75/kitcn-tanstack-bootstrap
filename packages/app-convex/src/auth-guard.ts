import { createServerFn } from "@tanstack/react-start";

import type { SessionClaims } from "./jwt-claims";

/**
 * Server-authoritative JWT claims read.
 *
 * Uses TanStack Start's `createServerFn` so the handler always runs on
 * the server — it parses the httpOnly `better-auth.convex_jwt` cookie
 * directly from the request header and decodes the JWT payload.
 *
 * - SSR: the handler is inlined into the same process, ~0 cost.
 * - Client nav: produces an HTTP GET to an internal RPC endpoint, so
 *   each navigation pays one round-trip in exchange for a
 *   server-authoritative check that doesn't trust any client-side
 *   state (not kitcn's auth store, not document.cookie, nothing).
 *
 * This is the single source of truth for "is there a valid session and
 * what's its role?" — used by both `_authenticated` (role gate) and
 * `_public/auth` (already-signed-in bounce).
 *
 * The cookie-parsing + JWT-refresh logic lives in `auth-guard.server.ts`
 * and is imported *dynamically* inside the handler body. That split is
 * required by `tanstack-start-core:import-protection`: a top-level
 * import of `@tanstack/react-start/server` here would drag server-only
 * symbols into the client bundle graph, since this module is also
 * imported by route components (`_authenticated.tsx`,
 * `_public/auth.tsx`). Keeping the server import inside a `.server.ts`
 * module that's only reached through a dynamic `import()` inside a
 * `createServerFn` handler is the plugin's documented escape hatch.
 *
 * Flow (in `auth-guard.server.ts`):
 *   1. Fast path — decode the `better-auth.convex_jwt` cookie and return
 *      claims if the JWT isn't within the expiry skew. No network.
 *   2. Refresh path — JWT missing or stale but the Better Auth
 *      `session_token` cookie is present, so POST the session cookie to
 *      Convex's `/api/auth/convex/token` endpoint to mint a fresh JWT.
 *      Costs one Convex RTT but keeps users with a valid session from
 *      getting bounced to `/auth` when their short-lived JWT aged out
 *      between navs. The refreshed JWT is not written back to the
 *      browser cookie — Convex sets it on the Convex site domain, not
 *      ours — so subsequent client navs in the same stale-JWT window
 *      each pay this RTT until Better Auth's own flows update the
 *      cookie. Implemented as a plain `fetch` rather than kitcn's
 *      `getToken()` because importing `./auth-server` pulls
 *      `@convex-dev/better-auth/react-start` into the client bundle,
 *      and that module contains a nested dynamic
 *      `import("@tanstack/react-start/server")` that 404s in the
 *      client chunk graph at runtime.
 *      Refresh outcomes are split into three buckets so a brief Convex
 *      outage doesn't silently log everyone out: 401/403 is a genuine
 *      "session no longer mints a JWT" and returns null (bounce to
 *      /auth); any other non-2xx / network error / malformed JSON
 *      throws a transient error. On that transient error the caller
 *      falls back to the stale JWT (grace period) rather than
 *      redirecting — the session cookie is still valid, subsequent
 *      navs retry the refresh automatically.
 *   3. No session cookie — user is signed out; return null without an
 *      RTT.
 */
export const fetchSessionClaims = createServerFn({ method: "GET" }).handler(
	async (): Promise<SessionClaims | null> => {
		const { readSessionClaims } = await import("./auth-guard.server");
		return readSessionClaims();
	},
);
