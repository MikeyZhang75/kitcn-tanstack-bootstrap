import { fetchSessionClaims } from "@repo/app-convex/auth-guard";
import { Separator } from "@repo/ui/components/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@repo/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_authenticated")({
	// `shouldReload: true` forces beforeLoad to re-run on every route
	// match — including sibling client navigations within `_authenticated`
	// (e.g. `/` → `/some-sibling`), not just fresh entries. Combined with
	// `fetchSessionClaims` (a server function), each navigation round-trips
	// to the server which parses the httpOnly cookie fresh.
	// Cost: 1 RTT per client nav; 0 RTT on SSR (handler runs inline).
	shouldReload: true,
	beforeLoad: async ({ location }) => {
		const claims = await fetchSessionClaims();

		if (!claims) {
			throw redirect({
				to: "/auth",
				search: { callbackUrl: location.href },
			});
		}

		if (claims.role !== "user") {
			throw redirect({ to: "/access-denied" });
		}
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
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
