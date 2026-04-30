"use client";

import { fetchSessionClaims } from "@repo/app-convex/auth-guard";
import { extractErrorMessage } from "@repo/app-convex/errors";
import {
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
} from "@repo/backend/shared/tables/user";
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

type AuthFormState = {
	username: string;
	password: string;
};

type AuthFormAction = {
	type: "set_field";
	field: keyof AuthFormState;
	value: string;
};

const initialAuthForm: AuthFormState = {
	username: "",
	password: "",
};

function authFormReducer(
	state: AuthFormState,
	action: AuthFormAction,
): AuthFormState {
	switch (action.type) {
		case "set_field":
			return { ...state, [action.field]: action.value };
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
	const [form, dispatchForm] = useReducer(authFormReducer, initialAuthForm);
	const { username, password } = form;

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

	function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		signIn.mutate({ username, password });
	}

	return (
		<main className="flex min-h-svh items-center justify-center px-6 py-16">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-2xl">登录</CardTitle>
					<CardDescription>使用用户名和密码登录管理后台。</CardDescription>
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
									placeholder="请输入用户名"
									required
									type="text"
									value={username}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="auth-password">密码</FieldLabel>
								<Input
									autoComplete="current-password"
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

				<CardFooter>
					<LoadingButton
						className="w-full"
						form="auth-form"
						loading={signIn.isPending}
						loadingText="处理中…"
						type="submit"
					>
						登录
					</LoadingButton>
				</CardFooter>
			</Card>
		</main>
	);
}
