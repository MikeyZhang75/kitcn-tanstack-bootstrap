"use client";

import {
	BellOutlined,
	CreditCardOutlined,
	LogoutOutlined,
	MoreOutlined,
	UserOutlined,
} from "@ant-design/icons";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { useSignOut } from "@repo/app-convex/use-auth";
import { useSession } from "@repo/app-convex/use-session";
import type { MenuProps } from "antd";
import { App, Avatar, Button, Dropdown, Flex, Typography } from "antd";

function getInitials(name: string | null | undefined): string {
	const source = name?.trim() || "";
	if (!source) return "U";
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
	}
	return source.slice(0, 2).toUpperCase();
}

interface NavUserProps {
	/** 侧边栏是否处于收起状态 —— 收起时只显示头像 */
	collapsed: boolean;
}

/**
 * 侧边栏底部的用户菜单。会话与登出都在这里自取（`useSession` / `useSignOut`），
 * 所以 `AppSidebar` 只需要传 `collapsed`。
 */
export function NavUser({ collapsed }: NavUserProps) {
	const { message } = App.useApp();
	const { user, isPending } = useSession();
	const signOut = useSignOut();

	const displayName = user ? user.name || user.username : null;
	const triggerStyle: React.CSSProperties = {
		height: 48,
		paddingInline: collapsed ? 0 : 8,
	};

	if (isPending || displayName == null) {
		return (
			<Button block disabled style={triggerStyle} type="text">
				<Flex align="center" gap={8} style={{ width: "100%" }}>
					<Avatar shape="square" size={32}>
						··
					</Avatar>
					{collapsed ? null : (
						<Typography.Text ellipsis>
							{isPending ? "加载中…" : "未登录"}
						</Typography.Text>
					)}
				</Flex>
			</Button>
		);
	}

	const items: MenuProps["items"] = [
		{ key: "profile", label: displayName, type: "group" },
		{ disabled: true, icon: <UserOutlined />, key: "account", label: "账户" },
		{
			disabled: true,
			icon: <CreditCardOutlined />,
			key: "billing",
			label: "账单",
		},
		{
			disabled: true,
			icon: <BellOutlined />,
			key: "notifications",
			label: "通知",
		},
		{ type: "divider" },
		{
			disabled: signOut.isPending,
			icon: <LogoutOutlined />,
			key: "signout",
			label: signOut.isPending ? "退出中…" : "退出登录",
		},
	];

	const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
		if (key !== "signout") return;
		signOut.mutate(undefined, {
			// 整页跳转：让 router 带着已清空的 localStorage 从头重建。
			onSuccess: () => window.location.assign("/auth"),
			onError: (error) =>
				message.error(extractErrorMessage(error) ?? "退出登录失败"),
		});
	};

	return (
		<Dropdown
			menu={{ items, onClick: handleMenuClick }}
			placement={collapsed ? "topLeft" : "topRight"}
			trigger={["click"]}
		>
			<Button block style={triggerStyle} type="text">
				<Flex align="center" gap={8} style={{ width: "100%" }}>
					<Avatar shape="square" size={32}>
						{getInitials(displayName)}
					</Avatar>
					{collapsed ? null : (
						<>
							<Typography.Text ellipsis style={{ flex: 1, textAlign: "left" }}>
								{displayName}
							</Typography.Text>
							<MoreOutlined />
						</>
					)}
				</Flex>
			</Button>
		</Dropdown>
	);
}
