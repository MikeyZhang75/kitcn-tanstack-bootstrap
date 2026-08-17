"use client";

import type { UserRole } from "@repo/backend/shared/tables/user";
import { useQuery } from "@tanstack/react-query";

import { useAuthedCRPC } from "./use-authed-crpc";
import { useSessionToken } from "./use-session-token";

export type SessionUser = {
	id: string;
	username: string;
	name: string;
	role: UserRole;
};

// Current identity for UI (the sidebar user menu). Runs the `session.me` query
// through the authed proxy, which threads the token and — when there is none —
// hands back `enabled: false`, so the "skip while signed out" behavior is now
// the proxy's job rather than a hand-written guard here. This is read-only UI
// state; the authoritative role gate lives in the `_authenticated` layout.
export function useSession(): {
	sessionToken: string | null;
	user: SessionUser | null;
	isPending: boolean;
	isAuthenticated: boolean;
} {
	const authed = useAuthedCRPC();
	const sessionToken = useSessionToken();

	const query = useQuery(authed.session.me.queryOptions());

	// `query.isError` must gate this: TanStack Query KEEPS the last successful
	// `data` when a refetch fails. `session.me` is a live Convex subscription,
	// so when a session is revoked (or expires) the query re-runs and throws
	// UNAUTHORIZED — without this check the hook would keep handing back the
	// stale user, and the `_authenticated` gate would leave an already-open tab
	// signed in until the next full reload.
	const user = query.isError
		? null
		: ((query.data?.data?.user ?? null) as SessionUser | null);

	return {
		sessionToken,
		user,
		isPending: sessionToken != null && query.isPending,
		isAuthenticated: user != null,
	};
}
