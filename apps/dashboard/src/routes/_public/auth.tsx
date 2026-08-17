"use client";

import { extractErrorMessage } from "@repo/app-convex/errors";
import { getSessionToken } from "@repo/app-convex/session-store";
import { useSignIn } from "@repo/app-convex/use-auth";
import { signInInputSchema } from "@repo/backend/shared/tables/user";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { App, Button, Card, Flex, Form, Input, Typography } from "antd";

import { zodStringRule } from "@/lib/zod-rule";

type AuthSearch = {
	callbackUrl?: string;
};

type AuthFormValues = {
	username: string;
	password: string;
};

export const Route = createFileRoute("/_public/auth")({
	validateSearch: (search: Record<string, unknown>): AuthSearch => ({
		callbackUrl:
			typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
	}),
	beforeLoad: () => {
		// Already-signed-in visitors (token present) have nothing to do on the
		// login form — bounce them home; the _authenticated gate then validates
		// the role. `_public` is `ssr: false`, so this beforeLoad runs on the
		// client (even on hard loads) and localStorage is available. A stale
		// token resolves to /auth in at most one bounce (the authed gate clears
		// it).
		if (getSessionToken() != null) {
			throw redirect({ to: "/" });
		}
	},
	component: AuthPage,
});

function AuthPage() {
	const { callbackUrl } = Route.useSearch();
	const { message } = App.useApp();
	const [form] = Form.useForm<AuthFormValues>();

	const signIn = useSignIn();

	const handleFinish = (values: AuthFormValues) => {
		signIn.mutate(values, {
			// Full-page navigation so the router rebuilds from scratch and re-runs
			// every beforeLoad with the freshly stored token in localStorage.
			onSuccess: () => window.location.assign(callbackUrl ?? "/"),
			onError: (error) =>
				message.error(extractErrorMessage(error) ?? "出现错误"),
		});
	};

	// 校验规则直接取后端 `session.signIn` 的 input schema 字段，中文文案跟着
	// schema 走（登录态的密码只要求非空 —— 见 user.ts 的注释）。
	const usernameRule = zodStringRule(signInInputSchema.shape.username);
	const passwordRule = zodStringRule(signInInputSchema.shape.password);

	return (
		<Flex
			align="center"
			justify="center"
			style={{ minHeight: "100dvh", padding: 24 }}
		>
			<Card style={{ maxWidth: 420, width: "100%" }}>
				<Typography.Title level={3} style={{ marginBlock: "0 4px" }}>
					登录
				</Typography.Title>
				<Typography.Paragraph type="secondary">
					使用用户名和密码登录管理后台。
				</Typography.Paragraph>

				<Form<AuthFormValues>
					disabled={signIn.isPending}
					form={form}
					layout="vertical"
					onFinish={handleFinish}
					requiredMark={false}
				>
					<Form.Item label="用户名" name="username" rules={[usernameRule]}>
						<Input autoComplete="username" placeholder="请输入用户名" />
					</Form.Item>

					<Form.Item label="密码" name="password" rules={[passwordRule]}>
						<Input.Password
							autoComplete="current-password"
							placeholder="请输入密码"
						/>
					</Form.Item>

					<Form.Item style={{ marginBottom: 0 }}>
						<Button
							block
							htmlType="submit"
							loading={signIn.isPending}
							type="primary"
						>
							登录
						</Button>
					</Form.Item>
				</Form>
			</Card>
		</Flex>
	);
}
