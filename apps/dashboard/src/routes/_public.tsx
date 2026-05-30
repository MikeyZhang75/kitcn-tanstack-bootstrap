import { createFileRoute, Outlet } from "@tanstack/react-router";

// `_public` is a bare layout group — no auth guard here. Pages that must
// bounce already-logged-in visitors (like /auth) put that check in their
// own `beforeLoad`. Pages that should be visible regardless of auth state
// (like /access-denied) just live here and inherit nothing.
export const Route = createFileRoute("/_public")({
	// Client-only render (`ssr: false`) so the whole app is a SPA. The public
	// pages render on the client, which means /auth's `beforeLoad` (it reads the
	// localStorage session token to bounce already-signed-in visitors) runs
	// client-side on hard loads too — matching the `_authenticated` gate. With
	// both layouts client-only there is no server render of route content
	// anywhere; the Nitro worker still SSRs the document shell per request.
	ssr: false,
	component: Outlet,
});
