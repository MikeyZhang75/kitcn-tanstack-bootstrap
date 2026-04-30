"use client";

import { fetchSessionClaims } from "@repo/app-convex/auth-guard";
import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
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
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type SyntheticEvent, useReducer } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/convex/auth-client";

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
	| { type: "toggle_mode" }
	| { type: "switch_to_signin_after_signup" };

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
		case "switch_to_signin_after_signup":
			// Signup succeeded but auto-signin failed — the account exists and
			// the invitation code is consumed, so retrying signup would throw
			// "邀请码已被使用". Keep username/password to let the user retry
			// signin with one click; drop the now-useless invitation code.
			return { ...state, mode: "signin", invitationCode: "" };
	}
}

export const Route = createFileRoute("/_public/auth")({
	validateSearch: (search: Record<string, unknown>): AuthSearch => ({
		callbackUrl:
			typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
	}),
	beforeLoad: async () => {
		// Already-signed-in visitors have nothing to do on the login form.
		// Bounce them home; the _authenticated layout then handles the role
		// check (and may still end up redirecting to /access-denied).
		//
		// Uses the same server-authoritative JWT read as `_authenticated` —
		// one source of truth for "is this user signed in?", no reliance on
		// client-side in-memory state.
		const claims = await fetchSessionClaims();
		if (claims) {
			throw redirect({ to: "/" });
		}
	},
	component: AuthPage,
});

function AuthPage() {
	const { callbackUrl } = Route.useSearch();
	const crpc = useCRPC();
	const [form, dispatchForm] = useReducer(authFormReducer, initialAuthForm);
	const { mode, username, password, invitationCode } = form;

	const onAuthSuccess = () => {
		// Full page navigation so the router rebuilds with the fresh
		// session cookie and re-runs every beforeLoad against it.
		// Avoids the race where useNavigate() evaluates _authenticated's
		// beforeLoad before document.cookie has been updated.
		window.location.assign(callbackUrl ?? "/");
	};

	const notifyError = (error: unknown) => {
		toast.error(extractErrorMessage(error) ?? "出现错误");
	};

	const signIn = useMutation({
		mutationFn: async (variables: { username: string; password: string }) => {
			const { data, error } = await authClient.signIn.username(variables);
			if (error) throw error;
			return data;
		},
		onSuccess: onAuthSuccess,
		onError: notifyError,
	});
	const signUpWithInvitation = useMutation(
		crpc.signup.signUpWithInvitation.mutationOptions({
			onSuccess: async () => {
				// signUpEmail created the user but didn't set cookies (no HTTP ctx).
				// Sign in via username to establish the session — normalization is
				// handled server-side by the username plugin.
				const { error } = await authClient.signIn.username({
					username,
					password,
				});
				if (error) {
					// Transient signin failure after a successful signup would
					// otherwise leave the user stranded: account created +
					// invitation code consumed + no session, with signup retry
					// blocked by "已被使用". Guide them to signin with credentials
					// preserved instead of surfacing the raw network error.
					toast.error("账户已创建，请使用用户名和密码登录", {
						duration: 8000,
					});
					dispatchForm({ type: "switch_to_signin_after_signup" });
					return;
				}
				onAuthSuccess();
			},
			onError: notifyError,
		}),
	);

	const isPending = signIn.isPending || signUpWithInvitation.isPending;

	function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();

		if (mode === "signup") {
			signUpWithInvitation.mutate({
				username,
				password,
				invitationCode,
			});
			return;
		}

		signIn.mutate({
			username,
			password,
		});
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
