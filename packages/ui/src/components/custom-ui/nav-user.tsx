"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@repo/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@repo/ui/components/sidebar";
import {
	BellIcon,
	CreditCardIcon,
	EllipsisVerticalIcon,
	LogOutIcon,
	UserCircleIcon,
} from "lucide-react";

function getInitials(name: string | null | undefined): string {
	const source = name?.trim() || "";
	if (!source) return "U";
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

export interface NavUserData {
	displayName: string;
	image?: string | null;
}

export interface NavUserProps {
	/** User data to display; null renders the "未登录" placeholder */
	user: NavUserData | null;
	/** When true, shows the "加载中…" placeholder */
	isLoading?: boolean;
	/** When true, disables the sign-out item and shows "退出中…" */
	isSigningOut?: boolean;
	/** Called when the user clicks the sign-out menu item */
	onSignOut: () => void;
}

export function NavUser({
	user,
	isLoading = false,
	isSigningOut = false,
	onSignOut,
}: NavUserProps) {
	const { isMobile } = useSidebar();

	if (isLoading || !user) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton disabled size="lg">
						<Avatar className="h-8 w-8 rounded-lg">
							<AvatarFallback className="rounded-lg">··</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">
								{isLoading ? "加载中…" : "未登录"}
							</span>
						</div>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	const { displayName, image } = user;
	const initials = getInitials(displayName);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
								size="lg"
							/>
						}
					>
						<Avatar className="h-8 w-8 rounded-lg grayscale">
							{image ? <AvatarImage alt={displayName} src={image} /> : null}
							<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">{displayName}</span>
						</div>
						<EllipsisVerticalIcon className="ml-auto size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									<Avatar className="h-8 w-8 rounded-lg">
										{image ? (
											<AvatarImage alt={displayName} src={image} />
										) : null}
										<AvatarFallback className="rounded-lg">
											{initials}
										</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">{displayName}</span>
									</div>
								</div>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem disabled>
								<UserCircleIcon />
								账户
							</DropdownMenuItem>
							<DropdownMenuItem disabled>
								<CreditCardIcon />
								账单
							</DropdownMenuItem>
							<DropdownMenuItem disabled>
								<BellIcon />
								通知
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={isSigningOut} onClick={onSignOut}>
							<LogOutIcon />
							{isSigningOut ? "退出中…" : "退出登录"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
