"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { useSessionToken } from "@repo/app-convex/use-session";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	const crpc = useCRPC();
	const sessionToken = useSessionToken() ?? "";

	// The read is public (no token); the toggle is admin-only and threads the
	// session token (guaranteed present inside _authenticated).
	const settingsQuery = useQuery(
		crpc.settings.getRegistrationSettings.queryOptions({}),
	);
	const requireInvitationCode = settingsQuery.data?.data?.requireInvitationCode;

	const updateMutation = useMutation(
		crpc.settings.setRequireInvitationCode.mutationOptions(),
	);

	// The switch is driven by the live query (single source of truth): the
	// mutation upserts the singleton and the Convex subscription pushes the new
	// value back, so we only disable the control while the write is in flight.
	const handleToggle = (checked: boolean) => {
		updateMutation.mutate(
			{ requireInvitationCode: checked, sessionToken },
			{
				onSuccess: () => toast.success("已保存"),
				onError: (err) => toast.error(extractErrorMessage(err) ?? "保存失败"),
			},
		);
	};

	return (
		<div className="flex flex-col gap-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">设置</h1>
				<p className="text-muted-foreground text-sm">管理注册与系统设置。</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>注册设置</CardTitle>
					<CardDescription>控制新用户如何注册账户。</CardDescription>
				</CardHeader>
				<CardContent>
					{settingsQuery.isPending ? (
						<Skeleton className="h-10 w-full" />
					) : (
						<div className="flex items-center justify-between gap-4">
							<div className="space-y-1">
								<Label htmlFor="require-invitation-code">注册需要邀请码</Label>
								<p className="text-muted-foreground text-sm">
									开启后，新用户必须填写有效的邀请码才能注册；关闭后，任何人都可以直接注册。
								</p>
							</div>
							<Switch
								checked={requireInvitationCode ?? true}
								disabled={updateMutation.isPending}
								id="require-invitation-code"
								onCheckedChange={handleToggle}
							/>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
