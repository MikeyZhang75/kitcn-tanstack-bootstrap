"use client";

import { useSyncExternalStore } from "react";

import { getSessionToken, subscribeSessionToken } from "./session-store";

// Reactive read of the localStorage session token. `useSyncExternalStore`
// subscribes to same-tab + cross-tab changes (see session-store.ts) so any
// sign-in / sign-out re-renders consumers immediately. SSR snapshot is `null`
// (no localStorage on the server) — moot in SPA mode, safe regardless.
//
// This lives in its own module rather than in `use-session.ts` because
// `use-authed-crpc.ts` needs it, and `use-session.ts` consumes *that* to run
// `session.me` — keeping the hook here is what breaks the import cycle.
export function useSessionToken(): string | null {
	return useSyncExternalStore(
		subscribeSessionToken,
		getSessionToken,
		() => null,
	);
}
