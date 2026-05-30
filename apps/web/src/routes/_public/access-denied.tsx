"use client";

import { useSignOut } from "@repo/app-convex/use-auth";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import { LoadingButton } from "@repo/ui/components/custom-ui/loading-button";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlertIcon } from "lucide-react";

export const Route = createFileRoute("/_public/access-denied")({
	component: AccessDeniedPage,
});

function AccessDeniedPage() {
	const signOut = useSignOut();

	return (
		<main className="flex min-h-svh items-center justify-center px-6 py-16">
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<CardTitle className="flex items-center justify-center gap-2 text-2xl">
						<ShieldAlertIcon className="text-destructive size-6" />
						权限不足
					</CardTitle>
					<CardDescription>你的账户没有访问本系统的权限。</CardDescription>
				</CardHeader>
				<CardContent>
					<LoadingButton
						className="w-full"
						loading={signOut.isPending}
						loadingText="退出中…"
						onClick={() =>
							signOut.mutate(undefined, {
								onSuccess: () => window.location.assign("/auth"),
							})
						}
						type="button"
					>
						退出登录
					</LoadingButton>
				</CardContent>
			</Card>
		</main>
	);
}
