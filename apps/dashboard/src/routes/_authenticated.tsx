import {
	clearSessionToken,
	getSessionToken,
} from "@repo/app-convex/session-store";
import { useSession } from "@repo/app-convex/use-session";
import { Separator } from "@repo/ui/components/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@repo/ui/components/sidebar";
import { Spinner } from "@repo/ui/components/spinner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_authenticated")({
	// Client-only: the entire authenticated app renders on the client (no SSR
	// pass) so the gate can read the session token from localStorage. Public
	// routes (/auth, /access-denied) still SSR normally.
	ssr: false,
	// Cheap, flash-free gate for the signed-out case — beforeLoad runs on the
	// client, so localStorage is available. This only checks token presence;
	// the authoritative role check happens in the component once `session.me`
	// resolves (a token can be stale/expired/revoked).
	beforeLoad: ({ location }) => {
		if (getSessionToken() == null) {
			throw redirect({ to: "/auth", search: { callbackUrl: location.href } });
		}
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { sessionToken, user, isPending } = useSession();

	useEffect(() => {
		// Token present but `me` resolved to no user → it's stale/expired/revoked.
		// Clear it so the redirect to /auth doesn't bounce straight back here.
		if (sessionToken != null && !isPending && user == null) {
			clearSessionToken();
		}
	}, [sessionToken, isPending, user]);

	if (sessionToken == null) {
		return <Navigate to="/auth" />;
	}
	if (isPending) {
		return (
			<div className="flex min-h-svh items-center justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}
	if (user == null) {
		return <Navigate to="/auth" />;
	}
	if (user.role !== "admin") {
		return <Navigate to="/access-denied" />;
	}

	return (
		<SidebarProvider className="h-svh overflow-hidden">
			<AppSidebar />
			<SidebarInset className="min-h-0">
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator
						className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
						orientation="vertical"
					/>
				</header>
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
