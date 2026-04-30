import { createFileRoute, Outlet } from "@tanstack/react-router";

// `_public` is a bare layout group — no auth guard here. Pages that must
// bounce already-logged-in visitors (like /auth) put that check in their
// own `beforeLoad`. Pages that should be visible regardless of auth state
// (like /access-denied) just live here and inherit nothing.
export const Route = createFileRoute("/_public")({
	component: Outlet,
});
