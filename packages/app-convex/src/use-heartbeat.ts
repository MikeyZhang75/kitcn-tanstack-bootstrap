"use client";

import { HEARTBEAT_INTERVAL_MS } from "@repo/backend/shared/tables/session";
import { useEffect, useRef } from "react";

import { useCRPCClient } from "./crpc";
import { useSessionToken } from "./use-session-token";

// Liveness ping for `session.lastSeenAt`.
//
// This is the only thing that writes that column. Convex queries can't write
// (`QueryCtx.db` is a reader), and nearly all authenticated traffic in this app
// is queries — `session.me` is a standing subscription and every list page is a
// query — so liveness can't ride along on ordinary requests.
//
// Fires on mount, then on an interval, and only while the tab is visible: a
// backgrounded tab pinging forever would make "last seen" mean "last had a tab
// open" instead of "last actually used the app". Becoming visible again pings
// immediately rather than waiting out the remaining interval.
//
// The mutation is fire-and-forget through the vanilla client (no React Query
// cache entry — there is nothing to read back), and failures are swallowed:
// a heartbeat that fails because the session was just revoked must not throw
// into the layout. The route gate handles revocation on its own, because
// `session.me` is a live subscription that re-runs and rejects.
export function useSessionHeartbeat(): void {
	const crpcClient = useCRPCClient();
	const sessionToken = useSessionToken();

	// Hold the client in a ref and key the effect on the token alone, so the
	// client can never go in the dependency array — an unstable identity there
	// would tear down and rebuild the timer on every render of the layout,
	// firing a heartbeat round-trip each time.
	//
	// kitcn >= 0.25 memoizes the merged client inside `CRPCProvider`, so
	// `useCRPCClient()` is referentially stable today. That is exactly why the
	// ref stays: the contract silently flipped in 0.25.1 (before it, the hook
	// returned a fresh Proxy on every render whenever the cRPC context was
	// built with `convexSiteUrl`, which it is here), so this must not depend on
	// an identity guarantee kitcn has already changed once.
	const clientRef = useRef(crpcClient);
	clientRef.current = crpcClient;

	useEffect(() => {
		if (sessionToken == null) return;

		let cancelled = false;
		const ping = () => {
			if (cancelled || document.visibilityState !== "visible") return;
			void clientRef.current.session.heartbeat
				.mutate({ sessionToken })
				.catch(() => {
					// Intentionally ignored — see the note above.
				});
		};

		ping();
		const timer = setInterval(ping, HEARTBEAT_INTERVAL_MS);
		document.addEventListener("visibilitychange", ping);

		return () => {
			cancelled = true;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", ping);
		};
	}, [sessionToken]);
}
