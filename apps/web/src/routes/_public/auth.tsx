"use client";

import { extractErrorMessage } from "@repo/app-convex/errors";
import { getSessionToken } from "@repo/app-convex/session-store";
import { useSignIn, useSignUp } from "@repo/app-convex/use-auth";
import {
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
} from "@repo/backend/shared/tables/user";
import { Button } from "@repo/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import { LoadingButton } from "@repo/ui/components/custom-ui/loading-button";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type SyntheticEvent, useReducer } from "react";
import { toast } from "sonner";

type AuthSearch = {
	callbackUrl?: string;
};

type AuthMode = "signin" | "signup";

type AuthFormState = {
	mode: AuthMode;
	username: string;
	password: string;
	invitationCode: string;
};

type AuthFormAction =
	| {
			type: "set_field";
			field: keyof Omit<AuthFormState, "mode">;
			value: string;
	  }
	| { type: "toggle_mode" };

const initialAuthForm: AuthFormState = {
	mode: "signin",
	username: "",
	password: "",
	invitationCode: "",
};

function authFormReducer(
	state: AuthFormState,
	action: AuthFormAction,
): AuthFormState {
	switch (action.type) {
		case "set_field":
			return { ...state, [action.field]: action.value };
		case "toggle_mode":
			return {
				...state,
				mode: state.mode === "signin" ? "signup" : "signin",
			};
	}
}

export const Route = createFileRoute("/_public/auth")({
	validateSearch: (search: Record<string, unknown>): AuthSearch => ({
		callbackUrl:
			typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
	}),
	beforeLoad: () => {
		// Already-signed-in visitors (token present) have nothing to do on the
		// login form — bounce them home; the _authenticated gate then validates
		// the role. SPA mode runs beforeLoad on the client, so localStorage is
		// available. A stale token resolves to /auth in at most one bounce
		// (the authed gate clears it).
		if (getSessionToken() != null) {
			throw redirect({ to: "/" });
		}
	},
	component: AuthPage,
});

function AuthPage() {
	const { callbackUrl } = Route.useSearch();
	const [form, dispatchForm] = useReducer(authFormReducer, initialAuthForm);
	const { mode, username, password, invitationCode } = form;

	const signIn = useSignIn();
	const signUp = useSignUp();

	const onAuthSuccess = () => {
		// Full-page navigation so the router rebuilds from scratch and re-runs
		// every beforeLoad with the freshly stored token in localStorage.
		window.location.assign(callbackUrl ?? "/");
	};

	const notifyError = (error: unknown) => {
		toast.error(extractErrorMessage(error) ?? "出现错误");
	};

	const isPending = signIn.isPending || signUp.isPending;

	function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();

		if (mode === "signup") {
			signUp.mutate(
				{ username, password, invitationCode },
				{ onSuccess: onAuthSuccess, onError: notifyError },
			);
			return;
		}

		signIn.mutate(
			{ username, password },
			{ onSuccess: onAuthSuccess, onError: notifyError },
		);
	}

	return (
		<main className="flex min-h-svh items-center justify-center px-6 py-16">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-2xl">
						{mode === "signup" ? "创建账户" : "登录"}
					</CardTitle>
					<CardDescription>
						{mode === "signup"
							? "填写信息以注册新账户。"
							: "使用用户名和密码登录。"}
					</CardDescription>
				</CardHeader>

				<CardContent>
					<form id="auth-form" onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="auth-username">用户名</FieldLabel>
								<Input
									autoComplete="username"
									id="auth-username"
									maxLength={USERNAME_MAX_LENGTH}
									minLength={USERNAME_MIN_LENGTH}
									onChange={(event) =>
										dispatchForm({
											type: "set_field",
											field: "username",
											value: event.target.value,
										})
									}
									pattern={USERNAME_PATTERN}
									placeholder={
										mode === "signup"
											? `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} 位，字母/数字/下划线`
											: "请输入用户名"
									}
									required
									type="text"
									value={username}
								/>
							</Field>
							{mode === "signup" ? (
								<Field>
									<FieldLabel htmlFor="auth-invitation">邀请码</FieldLabel>
									<Input
										autoComplete="off"
										id="auth-invitation"
										onChange={(event) =>
											dispatchForm({
												type: "set_field",
												field: "invitationCode",
												value: event.target.value,
											})
										}
										placeholder="请输入邀请码"
										required
										type="text"
										value={invitationCode}
									/>
								</Field>
							) : null}
							<Field>
								<FieldLabel htmlFor="auth-password">密码</FieldLabel>
								<Input
									autoComplete={
										mode === "signup" ? "new-password" : "current-password"
									}
									id="auth-password"
									minLength={PASSWORD_MIN_LENGTH}
									onChange={(event) =>
										dispatchForm({
											type: "set_field",
											field: "password",
											value: event.target.value,
										})
									}
									placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
									required
									type="password"
									value={password}
								/>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>

				<CardFooter className="flex-col items-stretch gap-3">
					<LoadingButton
						className="w-full"
						form="auth-form"
						loading={isPending}
						loadingText="处理中…"
						type="submit"
					>
						{mode === "signup" ? "创建账户" : "登录"}
					</LoadingButton>
					<Button
						className="w-full"
						onClick={() => dispatchForm({ type: "toggle_mode" })}
						type="button"
						variant="ghost"
					>
						{mode === "signin" ? "还没有账户？注册" : "已有账户？登录"}
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
