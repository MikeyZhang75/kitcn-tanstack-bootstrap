"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { useSessionToken } from "@repo/app-convex/use-session";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { App, Card, Flex, Skeleton, Switch, Typography } from "antd";

export const Route = createFileRoute("/_authenticated/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	const crpc = useCRPC();
	const { message } = App.useApp();
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
				onSuccess: () => message.success("已保存"),
				onError: (err) => message.error(extractErrorMessage(err) ?? "保存失败"),
			},
		);
	};

	return (
		<Flex gap={24} vertical>
			<div>
				<Typography.Title level={3} style={{ marginBlock: "0 4px" }}>
					设置
				</Typography.Title>
				<Typography.Text type="secondary">管理注册与系统设置。</Typography.Text>
			</div>

			<Card title="注册设置">
				<Typography.Paragraph type="secondary">
					控制新用户如何注册账户。
				</Typography.Paragraph>
				{settingsQuery.isPending ? (
					<Skeleton active paragraph={{ rows: 1 }} title={false} />
				) : (
					<Flex align="center" gap={16} justify="space-between">
						<div>
							<Typography.Text strong>注册需要邀请码</Typography.Text>
							<Typography.Paragraph
								style={{ marginBottom: 0 }}
								type="secondary"
							>
								开启后，新用户必须填写有效的邀请码才能注册；关闭后，任何人都可以直接注册。
							</Typography.Paragraph>
						</div>
						<Switch
							checked={requireInvitationCode ?? true}
							loading={updateMutation.isPending}
							onChange={handleToggle}
						/>
					</Flex>
				)}
			</Card>
		</Flex>
	);
}
