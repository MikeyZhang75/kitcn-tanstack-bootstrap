// Client-side session token store. The opaque token minted by `signIn` /
// `signUpWithInvitation` lives in localStorage (no httpOnly cookie, no JWT) and
// is threaded into every authenticated cRPC call's input. This is the single
// source of truth for "is there a token?" on the client.
//
// localStorage's native `storage` event only fires in *other* tabs, so we emit
// a custom same-tab event on write/clear; `subscribeSessionToken` listens to
// both, which lets `useSessionToken` (useSyncExternalStore) re-render the
// current tab the moment the token changes.

const STORAGE_KEY = "app.session_token";
const CHANGE_EVENT = "app:session-token-changed";

export function getSessionToken(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export function setSessionToken(token: string): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, token);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSessionToken(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(STORAGE_KEY);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeSessionToken(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	window.addEventListener(CHANGE_EVENT, callback);
	window.addEventListener("storage", callback);
	return () => {
		window.removeEventListener(CHANGE_EVENT, callback);
		window.removeEventListener("storage", callback);
	};
}
