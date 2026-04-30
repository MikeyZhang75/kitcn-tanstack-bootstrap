import { getRequest } from "@tanstack/react-start/server";

import { claimsFromToken, type SessionClaims } from "./jwt-claims";

const JWT_COOKIE_REGEX =
	/(?:^|;\s*)(?:__Secure-)?better-auth\.convex_jwt=([^;]+)/;
const SESSION_COOKIE_REGEX =
	/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/;

// Treat JWTs expiring within this window as stale — avoids racing the
// backend on a token that's technically valid at read time but dead by
// the time the subsequent RPC lands.
const EXPIRY_SKEW_SECONDS = 10;

class JwtRefreshError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "JwtRefreshError";
	}
}

export async function readSessionClaims(): Promise<SessionClaims | null> {
	const cookieHeader = getRequest().headers.get("cookie") ?? "";

	const jwtMatch = cookieHeader.match(JWT_COOKIE_REGEX);
	// Decode the existing JWT cookie before attempting refresh so we can
	// fall back to it if the refresh call trips on a transient Convex
	// outage — see the catch block below.
	const staleClaims = jwtMatch
		? claimsFromToken(decodeURIComponent(jwtMatch[1]))
		: null;

	if (staleClaims && !isExpired(staleClaims.expiresAt)) return staleClaims;

	if (!SESSION_COOKIE_REGEX.test(cookieHeader)) return null;

	try {
		return claimsFromToken(await refreshJwt(cookieHeader));
	} catch (error) {
		// Transient refresh failure (Convex unreachable, 5xx, malformed
		// JSON). The session cookie is still valid — the user is not
		// signed out — so fall back to the stale JWT rather than
		// bouncing to /auth. Subsequent navs will retry the refresh
		// automatically. If we have no stale JWT at all (fresh session
		// where the convex_jwt cookie hasn't landed yet), rethrow so
		// the route-level error surface handles it instead of silently
		// redirecting the user to /auth — they'd just bounce back here
		// on retry.
		console.error(
			"[auth-guard] JWT refresh failed; falling back to stale claims",
			error,
		);
		if (staleClaims) return staleClaims;
		throw error;
	}
}

async function refreshJwt(cookieHeader: string): Promise<string | null> {
	let res: Response;
	try {
		res = await fetch(
			`${import.meta.env.VITE_CONVEX_SITE_URL}/api/auth/convex/token`,
			{
				headers: {
					cookie: cookieHeader,
					"accept-encoding": "identity",
				},
			},
		);
	} catch (cause) {
		// Network-level failure (DNS, TCP, TLS, abort). Never a session
		// statement — always transient.
		throw new JwtRefreshError("convex token endpoint unreachable", { cause });
	}

	// Better Auth's convex plugin answers 401/403 when the session cookie
	// no longer mints a JWT (revoked or expired session). That's a real
	// sign-out, not an outage — return null so the caller bounces the
	// user to /auth.
	if (res.status === 401 || res.status === 403) return null;

	// Every other non-2xx (5xx during a Convex incident, 502 mid-deploy,
	// 429 rate-limit, 404 endpoint mismatch) is a server-side problem.
	// Throw so the caller can fall back to the stale JWT instead of
	// treating the user as signed out.
	if (!res.ok) {
		throw new JwtRefreshError(`convex token endpoint returned ${res.status}`);
	}

	let data: { token?: string } | null;
	try {
		data = (await res.json()) as { token?: string } | null;
	} catch (cause) {
		throw new JwtRefreshError("convex token endpoint returned malformed JSON", {
			cause,
		});
	}

	return data?.token ?? null;
}

function isExpired(expSeconds: number): boolean {
	if (!expSeconds) return true;
	return Math.floor(Date.now() / 1000) >= expSeconds - EXPIRY_SKEW_SECONDS;
}
