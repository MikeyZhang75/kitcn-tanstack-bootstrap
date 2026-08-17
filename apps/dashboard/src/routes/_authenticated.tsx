import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import {
	clearSessionToken,
	getSessionToken,
} from "@repo/app-convex/session-store";
import { useSessionHeartbeat } from "@repo/app-convex/use-heartbeat";
import { useSession } from "@repo/app-convex/use-session";
import {
	createFileRoute,
	Navigate,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { Button, Flex, Grid, Layout, Spin, theme } from "antd";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";

const { Content, Header } = Layout;

export const Route = createFileRoute("/_authenticated")({
	// Client-only render (`ssr: false`). The whole app renders on the client —
	// `_public` is `ssr: false` too — so `beforeLoad` runs on the client and
	// localStorage is available here. This is a cheap, flash-free presence check
	// for the signed-out case; the authoritative role check happens in the
	// component once `session.me` resolves (a token can be stale/expired/revoked).
	ssr: false,
	beforeLoad: ({ location }) => {
		if (getSessionToken() == null) {
			throw redirect({ to: "/auth", search: { callbackUrl: location.href } });
		}
	},
	component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
	const { sessionToken, user, isPending } = useSession();
	const { token } = theme.useToken();
	const screens = Grid.useBreakpoint();
	// `useBreakpoint` 首帧返回空对象，所以显式和 `false` 比较：未知时按桌面处理。
	const isMobile = screens.lg === false;
	const [collapsed, setCollapsed] = useState(false);

	// 心跳是 `session.lastSeenAt` 的唯一写入方（Convex 的 query 不能写库，而已鉴权
	// 流量几乎全是 query）。放在这里是因为它正好覆盖「登录后停留在应用内」的整个
	// 时段；hook 内部只在标签页可见时打点。
	useSessionHeartbeat();

	useEffect(() => {
		// 越过 lg 断点时自动跟随；用户之后仍可用 header 上的按钮手动切换。
		setCollapsed(isMobile);
	}, [isMobile]);

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
			<Flex align="center" justify="center" style={{ minHeight: "100dvh" }}>
				<Spin size="large" />
			</Flex>
		);
	}
	if (user == null) {
		return <Navigate to="/auth" />;
	}
	if (user.role !== "admin") {
		return <Navigate to="/access-denied" />;
	}

	// `hasSider` 必须显式传：`AppSidebar` 是个包装组件，antd 无法从 children
	// 里探测到 `Layout.Sider`，不传就不会应用横向 flex 布局。
	// 外层高度锁在 100dvh，滚动交给 `Content`（`minHeight: 0` + `overflow: auto`），
	// 这样长页面只在内容区滚动，不会出现整页 + 内容区的双滚动条。
	return (
		<Layout hasSider style={{ height: "100dvh" }}>
			<AppSidebar collapsed={collapsed} collapsedWidth={isMobile ? 0 : 64} />
			<Layout style={{ minWidth: 0 }}>
				<Header
					style={{
						alignItems: "center",
						backgroundColor: token.colorBgContainer,
						borderBlockEnd: `1px solid ${token.colorSplit}`,
						display: "flex",
						flexShrink: 0,
						gap: 8,
						height: 56,
						lineHeight: "56px",
						paddingInline: 16,
					}}
				>
					<Button
						aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
						icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
						onClick={() => setCollapsed((value) => !value)}
						type="text"
					/>
				</Header>
				<Content style={{ minHeight: 0, overflow: "auto", padding: 16 }}>
					<Outlet />
				</Content>
			</Layout>
		</Layout>
	);
}
