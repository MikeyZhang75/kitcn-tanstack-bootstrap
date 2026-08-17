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

	// `useCRPCClient()` returns a fresh Proxy on every render whenever the cRPC
	// context was built with `convexSiteUrl` (it is here), so it must NOT go in
	// the dependency array — the effect would tear down and rebuild the timer on
	// every render of the layout, firing a heartbeat round-trip each time. Hold
	// it in a ref and key the effect on the token alone.
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
