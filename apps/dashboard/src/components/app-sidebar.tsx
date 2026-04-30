"use client";

import { extractErrorMessage } from "@repo/app-convex/errors";
import { NavUser } from "@repo/ui/components/custom-ui/nav-user";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@repo/ui/components/sidebar";
import { useMutation } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCardIcon, LayoutDashboardIcon, TicketIcon } from "lucide-react";
import { toast } from "sonner";

import {
	authClient,
	useSignOutMutationOptions,
} from "@/lib/convex/auth-client";

const navItems = [
	{ title: "仪表盘", to: "/", icon: LayoutDashboardIcon },
	{ title: "邀请码", to: "/invitations", icon: TicketIcon },
] as const;

function AppNavUser() {
	const { data: session, isPending } = authClient.useSession();
	const signOut = useMutation(
		useSignOutMutationOptions({
			onSuccess: () => {
				window.location.assign("/auth");
			},
			onError: (error) => {
				toast.error(extractErrorMessage(error) ?? "退出登录失败");
			},
		}),
	);
	const sessionUser = session?.user;
	const user = sessionUser
		? {
				displayName: sessionUser.displayUsername || sessionUser.username || "",
				image: sessionUser.image,
			}
		: null;

	return (
		<NavUser
			isLoading={isPending}
			isSigningOut={signOut.isPending}
			onSignOut={() => signOut.mutate(undefined)}
			user={user}
		/>
	);
}

export function AppSidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton className="data-active:bg-transparent" size="lg">
							<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
								<CreditCardIcon className="size-4" />
							</div>
							<span className="truncate font-semibold">管理后台</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>导航</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => (
								<SidebarMenuItem key={item.to}>
									<SidebarMenuButton
										isActive={pathname === item.to}
										render={<Link to={item.to} />}
										tooltip={item.title}
									>
										<item.icon />
										<span>{item.title}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<AppNavUser />
			</SidebarFooter>
		</Sidebar>
	);
}
