"use client";

import { useMutation } from "@tanstack/react-query";

import { useCRPC, useCRPCClient } from "./crpc";
import { clearSessionToken, setSessionToken } from "./session-store";
import { useSessionToken } from "./use-session";

// Auth action hooks shared by both apps. They wrap the cRPC mutations and own
// the localStorage token side effects (store on sign-in/up, clear on sign-out)
// so call sites only handle navigation. `signIn`/`signUp` return
// `{ sessionToken }`; the caller adds its own `onSuccess` (navigation) at
// `.mutate(vars, { onSuccess })`, which runs after the token is stored.

export function useSignIn() {
	const crpc = useCRPC();
	return useMutation({
		...crpc.session.signIn.mutationOptions(),
		onSuccess: (result) => {
			setSessionToken(result.data.sessionToken);
		},
	});
}

export function useSignUp() {
	const crpc = useCRPC();
	return useMutation({
		...crpc.signup.signUpWithInvitation.mutationOptions(),
		onSuccess: (result) => {
			setSessionToken(result.data.sessionToken);
		},
	});
}

// Sign-out takes no variables: it reads the current token from the store,
// revokes it server-side (idempotent — skips the round trip if already gone),
// and clears localStorage. Callers pass navigation via `.mutate(undefined,
// { onSuccess })`.
export function useSignOut() {
	const crpcClient = useCRPCClient();
	const sessionToken = useSessionToken();
	return useMutation({
		mutationFn: async () => {
			if (sessionToken == null) return null;
			return crpcClient.session.signOut.mutate({ sessionToken });
		},
		onSuccess: () => {
			clearSessionToken();
		},
	});
}
