"use client";

import type { UserRole } from "@repo/backend/shared/tables/user";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useCRPC } from "./crpc";
import { getSessionToken, subscribeSessionToken } from "./session-store";

export type SessionUser = {
	id: string;
	username: string;
	name: string;
	role: UserRole;
};

// Reactive read of the localStorage session token. `useSyncExternalStore`
// subscribes to same-tab + cross-tab changes (see session-store.ts) so any
// sign-in / sign-out re-renders consumers immediately. SSR snapshot is `null`
// (no localStorage on the server) — moot in SPA mode, safe regardless.
export function useSessionToken(): string | null {
	return useSyncExternalStore(
		subscribeSessionToken,
		getSessionToken,
		() => null,
	);
}

// Current identity for UI (the sidebar user menu). Runs the `session.me` query
// with the localStorage token; skipped entirely when there is no token. This
// is read-only UI state — the authoritative role gate lives in the route
// `beforeLoad`, not here.
export function useSession(): {
	sessionToken: string | null;
	user: SessionUser | null;
	isPending: boolean;
	isAuthenticated: boolean;
} {
	const crpc = useCRPC();
	const sessionToken = useSessionToken();

	const query = useQuery({
		...crpc.session.me.queryOptions({ sessionToken: sessionToken ?? "" }),
		enabled: sessionToken != null,
	});

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
