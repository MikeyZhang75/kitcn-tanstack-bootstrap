"use client";

import { useSignOut } from "@repo/app-convex/use-auth";
import { createFileRoute } from "@tanstack/react-router";
import { Button, Flex, Result } from "antd";

export const Route = createFileRoute("/_public/access-denied")({
	component: AccessDeniedPage,
});

function AccessDeniedPage() {
	const signOut = useSignOut();

	// 落到这个页面不会自动登出 —— 由用户自己决定是否退出当前账户。
	return (
		<Flex
			align="center"
			justify="center"
			style={{ minHeight: "100dvh", padding: 24 }}
		>
			<Result
				extra={
					<Button
						loading={signOut.isPending}
						onClick={() =>
							signOut.mutate(undefined, {
								onSuccess: () => window.location.assign("/auth"),
							})
						}
						type="primary"
					>
						退出登录
					</Button>
				}
				status="403"
				subTitle="你的账户没有访问本系统的权限。"
				title="权限不足"
			/>
		</Flex>
	);
}
