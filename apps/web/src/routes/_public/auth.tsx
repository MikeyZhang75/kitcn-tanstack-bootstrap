"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { getSessionToken } from "@repo/app-convex/session-store";
import { useSignIn, useSignUp } from "@repo/app-convex/use-auth";
import {
	INVITATION_CODE_MAX_LENGTH,
	INVITATION_CODE_MIN_LENGTH,
} from "@repo/backend/shared/tables/invitations";
import {
	PASSWORD_MIN_LENGTH,
	signInInputSchema,
	signUpWithInvitationInputSchema,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
} from "@repo/backend/shared/tables/user";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { App, Button, Card, Flex, Form, Input, Typography } from "antd";
import { useState } from "react";

import { zodStringRule } from "./-lib/zod-rule";

type AuthSearch = {
	callbackUrl?: string;
};

type AuthMode = "signin" | "signup";

type AuthFormValues = {
	username: string;
	password: string;
	invitationCode?: string;
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
	const [mode, setMode] = useState<AuthMode>("signin");
	const [form] = Form.useForm<AuthFormValues>();

	const signIn = useSignIn();
	const signUp = useSignUp();

	const crpc = useCRPC();
	// Whether signup requires an invitation code is an admin-controlled, live
	// setting (dashboard /settings). Default to requiring it until the query
	// resolves — the safe default never lets a gated signup omit the field.
	const settingsQuery = useQuery(
		crpc.settings.getRegistrationSettings.queryOptions({}),
	);
	const requireInvitationCode =
		settingsQuery.data?.data?.requireInvitationCode ?? true;

	const isSignUp = mode === "signup";
	const isPending = signIn.isPending || signUp.isPending;

	const onAuthSuccess = () => {
		// Full-page navigation so the router rebuilds from scratch and re-runs
		// every beforeLoad with the freshly stored token in localStorage.
		window.location.assign(callbackUrl ?? "/");
	};

	const notifyError = (error: unknown) => {
		message.error(extractErrorMessage(error) ?? "出现错误");
	};

	const handleFinish = (values: AuthFormValues) => {
		if (isSignUp) {
			signUp.mutate(
				{
					username: values.username,
					password: values.password,
					// Only send a code when one is required; otherwise omit it so the
					// optional backend field stays undefined.
					invitationCode: requireInvitationCode
						? values.invitationCode
						: undefined,
				},
				{ onSuccess: onAuthSuccess, onError: notifyError },
			);
			return;
		}

		signIn.mutate(
			{ username: values.username, password: values.password },
			{ onSuccess: onAuthSuccess, onError: notifyError },
		);
	};

	// 校验规则一律从后端 procedure 的 input schema 上取字段，中文文案跟着 schema
	// 走。登录态的密码只要求非空、注册态才有最短长度 —— 差异在 user.ts 里已经
	// 解释过，这里只是按 mode 选对应的那个 schema。
	const usernameRule = zodStringRule(
		isSignUp
			? signUpWithInvitationInputSchema.shape.username
			: signInInputSchema.shape.username,
	);
	const passwordRule = zodStringRule(
		isSignUp
			? signUpWithInvitationInputSchema.shape.password
			: signInInputSchema.shape.password,
	);
	const invitationCodeRule = zodStringRule(
		signUpWithInvitationInputSchema.shape.invitationCode,
	);

	return (
		<Flex
			align="center"
			justify="center"
			style={{ minHeight: "100dvh", padding: 24 }}
		>
			<Card style={{ maxWidth: 420, width: "100%" }}>
				<Typography.Title level={3} style={{ marginBlock: "0 4px" }}>
					{isSignUp ? "创建账户" : "登录"}
				</Typography.Title>
				<Typography.Paragraph type="secondary">
					{isSignUp ? "填写信息以注册新账户。" : "使用用户名和密码登录。"}
				</Typography.Paragraph>

				<Form<AuthFormValues>
					disabled={isPending}
					form={form}
					layout="vertical"
					onFinish={handleFinish}
					requiredMark={false}
				>
					<Form.Item label="用户名" name="username" rules={[usernameRule]}>
						<Input
							autoComplete="username"
							maxLength={USERNAME_MAX_LENGTH}
							placeholder={
								isSignUp
									? `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} 位，字母/数字/下划线`
									: "请输入用户名"
							}
						/>
					</Form.Item>

					<Form.Item label="密码" name="password" rules={[passwordRule]}>
						<Input.Password
							autoComplete={isSignUp ? "new-password" : "current-password"}
							placeholder={
								isSignUp ? `至少 ${PASSWORD_MIN_LENGTH} 位` : "请输入密码"
							}
						/>
					</Form.Item>

					{isSignUp && requireInvitationCode ? (
						<Form.Item
							label="邀请码"
							name="invitationCode"
							rules={[invitationCodeRule]}
						>
							<Input
								autoComplete="off"
								maxLength={INVITATION_CODE_MAX_LENGTH}
								placeholder={`请输入邀请码（至少 ${INVITATION_CODE_MIN_LENGTH} 位）`}
							/>
						</Form.Item>
					) : null}

					<Form.Item style={{ marginBottom: 8 }}>
						<Button block htmlType="submit" loading={isPending} type="primary">
							{isSignUp ? "创建账户" : "登录"}
						</Button>
					</Form.Item>
				</Form>

				<Button
					block
					disabled={isPending}
					onClick={() => setMode(isSignUp ? "signin" : "signup")}
					type="text"
				>
					{isSignUp ? "已有账户？登录" : "还没有账户？注册"}
				</Button>
			</Card>
		</Flex>
	);
}
