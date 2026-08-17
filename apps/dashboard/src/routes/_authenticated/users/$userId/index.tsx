"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { useSession } from "@repo/app-convex/use-session";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	App,
	Button,
	Descriptions,
	Flex,
	Result,
	Skeleton,
	Tag,
	Typography,
} from "antd";
import { useCallback, useMemo, useState } from "react";

import { dateFormat } from "../-lib/format";
import { useOffsetPagination } from "../-lib/pagination";
import type { SessionRow } from "../-model/session-row";
import { RevokeAllDialog } from "./-components/revoke-all-dialog";
import { RevokeSessionDialog } from "./-components/revoke-session-dialog";
import { UserSessionsTable } from "./-components/user-sessions-table";

export const Route = createFileRoute("/_authenticated/users/$userId/")({
	component: UserDetailPage,
});

const DEFAULT_PAGE_SIZE = 20;

function UserDetailPage() {
	const { userId } = Route.useParams();
	const crpc = useCRPC();
	const { message } = App.useApp();
	// The signed-in admin — used to label the "this is you" case in the
	// revoke-all dialog. The exclusion itself is enforced server-side.
	const { sessionToken: rawToken, user: currentUser } = useSession();
	const sessionToken = rawToken ?? "";

	const userQuery = useQuery(
		crpc.users.get.queryOptions({ id: userId, sessionToken }),
	);
	const user = userQuery.data?.data?.user;

	const countQuery = useQuery(
		crpc.session.countByUser.queryOptions({ userId, sessionToken }),
	);
	const total = countQuery.data?.data?.total;
	const capped = countQuery.data?.data?.capped;

	const { pageIndex, pageSize, paginationProps } = useOffsetPagination(
		DEFAULT_PAGE_SIZE,
		total,
		capped,
	);

	const pageQuery = useQuery({
		...crpc.session.listByUser.queryOptions({
			userId,
			page: pageIndex,
			pageSize,
			sessionToken,
		}),
		placeholderData: keepPreviousData,
	});

	const sessions: SessionRow[] = useMemo(
		() =>
			(pageQuery.data?.data?.items ?? []).map((session) => ({
				id: session.id,
				status: session.status,
				expiresAt: new Date(session.expiresAt),
				lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : null,
				endedAt: session.endedAt ? new Date(session.endedAt) : null,
				revokedBy: session.revokedBy ?? null,
				revokedByName: session.revokedByName ?? null,
				ipAddress: session.ipAddress ?? null,
				userAgent: session.userAgent ?? null,
				createdAt: new Date(session.createdAt),
				isCurrent: session.isCurrent,
			})),
		[pageQuery.data],
	);

	const [revoking, setRevoking] = useState<SessionRow | null>(null);
	const [revokeAllOpen, setRevokeAllOpen] = useState(false);

	const revokeMutation = useMutation(crpc.session.revoke.mutationOptions());
	const revokeAllMutation = useMutation(
		crpc.session.revokeAllForUser.mutationOptions(),
	);

	const handleRevoke = useCallback((session: SessionRow) => {
		setRevoking(session);
	}, []);

	const handleRevokeConfirm = () => {
		if (!revoking) return;
		revokeMutation.mutate(
			{ id: revoking.id, sessionToken },
			{
				onSuccess: () => {
					message.success("会话已终止");
					setRevoking(null);
				},
				onError: (err) => {
					message.error(extractErrorMessage(err) ?? "终止失败");
				},
			},
		);
	};

	const handleRevokeAllConfirm = () => {
		revokeAllMutation.mutate(
			{ userId, sessionToken },
			{
				onSuccess: (result) => {
					const revoked = result.data.revoked;
					message.success(
						revoked > 0 ? `已终止 ${revoked} 个会话` : "没有需要终止的会话",
					);
					setRevokeAllOpen(false);
				},
				onError: (err) => {
					message.error(extractErrorMessage(err) ?? "终止失败");
				},
			},
		);
	};

	if (userQuery.isPending) {
		return <Skeleton active paragraph={{ rows: 4 }} />;
	}
	if (!user) {
		return (
			<Result
				extra={
					<Link to="/users">
						<Button type="primary">返回用户列表</Button>
					</Link>
				}
				status="404"
				subTitle={extractErrorMessage(userQuery.error) ?? "用户不存在"}
				title="找不到该用户"
			/>
		);
	}

	return (
		<Flex gap={24} vertical>
			<Flex align="flex-start" gap={16} justify="space-between">
				<div>
					<Link to="/users">
						<Button icon={<ArrowLeftOutlined />} size="small" type="text">
							返回用户列表
						</Button>
					</Link>
					<Typography.Title level={3} style={{ marginBlock: "8px 4px" }}>
						{user.username}
					</Typography.Title>
					<Typography.Text type="secondary">
						会话记录。终止后该设备立即登出，记录保留。
					</Typography.Text>
				</div>
				<Button danger onClick={() => setRevokeAllOpen(true)}>
					全部踢下线
				</Button>
			</Flex>

			<Descriptions
				bordered
				column={{ xs: 1, sm: 2, md: 3 }}
				items={[
					{ key: "name", label: "姓名", children: user.name },
					{
						key: "role",
						label: "角色",
						children: (
							<Tag color={user.role === "admin" ? "gold" : undefined}>
								{user.role === "admin" ? "管理员" : "用户"}
							</Tag>
						),
					},
					{
						key: "createdAt",
						label: "注册时间",
						children: dateFormat.format(new Date(user.createdAt)),
					},
				]}
				size="small"
			/>

			<UserSessionsTable
				data={sessions}
				loading={pageQuery.isFetching}
				onRevoke={handleRevoke}
				pagination={paginationProps}
			/>

			<RevokeSessionDialog
				isPending={revokeMutation.isPending}
				onConfirm={handleRevokeConfirm}
				onOpenChange={(next) => {
					if (!next) setRevoking(null);
				}}
				session={revoking}
			/>

			<RevokeAllDialog
				isPending={revokeAllMutation.isPending}
				isSelf={currentUser?.id === userId}
				onConfirm={handleRevokeAllConfirm}
				onOpenChange={setRevokeAllOpen}
				open={revokeAllOpen}
				username={user.username}
			/>
		</Flex>
	);
}
