"use client";

import {
	CreditCardOutlined,
	DashboardOutlined,
	KeyOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import { Link, useRouterState } from "@tanstack/react-router";
import type { MenuProps } from "antd";
import { Flex, Layout, Menu, theme, Typography } from "antd";

import { NavUser } from "@/components/nav-user";

const { Sider } = Layout;

// 导航项。新增页面时在这里加一行，`_authenticated` 外壳会自动取用。
const navItems = [
	{ icon: <DashboardOutlined />, title: "仪表盘", to: "/" },
	{ icon: <KeyOutlined />, title: "邀请码", to: "/invitations" },
	{ icon: <SettingOutlined />, title: "设置", to: "/settings" },
] as const;

interface AppSidebarProps {
	collapsed: boolean;
	/** 收起时的宽度；移动端传 0 表示完全隐藏 */
	collapsedWidth: number;
}

export function AppSidebar({ collapsed, collapsedWidth }: AppSidebarProps) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { token } = theme.useToken();

	const items: MenuProps["items"] = navItems.map((item) => ({
		icon: item.icon,
		key: item.to,
		label: <Link to={item.to}>{item.title}</Link>,
	}));

	return (
		<Sider
			collapsed={collapsed}
			collapsedWidth={collapsedWidth}
			style={{ borderInlineEnd: `1px solid ${token.colorSplit}` }}
			theme="light"
			width={220}
		>
			<Flex style={{ height: "100%" }} vertical>
				<Flex
					align="center"
					gap={8}
					style={{
						flexShrink: 0,
						height: 56,
						paddingInline: collapsed ? 0 : 16,
						justifyContent: collapsed ? "center" : undefined,
					}}
				>
					<Flex
						align="center"
						justify="center"
						style={{
							backgroundColor: token.colorPrimary,
							borderRadius: token.borderRadius,
							color: token.colorWhite,
							flexShrink: 0,
							height: 32,
							width: 32,
						}}
					>
						<CreditCardOutlined />
					</Flex>
					{collapsed ? null : (
						<Typography.Text ellipsis strong>
							管理后台
						</Typography.Text>
					)}
				</Flex>

				{/* Sider 收起时 antd 会通过 SiderContext 自动把 Menu 切成 icon 模式，
				    并给每项加上 tooltip —— 无需手动传 inlineCollapsed。 */}
				<Menu
					items={items}
					mode="inline"
					selectedKeys={[pathname]}
					style={{
						borderInlineEnd: 0,
						flex: 1,
						minHeight: 0,
						overflow: "auto",
					}}
				/>

				<div style={{ flexShrink: 0, padding: 8 }}>
					<NavUser collapsed={collapsed} />
				</div>
			</Flex>
		</Sider>
	);
}
