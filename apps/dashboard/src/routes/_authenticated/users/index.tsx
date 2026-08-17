"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { useSessionToken } from "@repo/app-convex/use-session";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Flex, Typography } from "antd";
import { useMemo } from "react";

import { UsersTable } from "./-components/users-table";
import { useOffsetPagination } from "./-lib/pagination";
import type { UserRow } from "./-model/user-row";

export const Route = createFileRoute("/_authenticated/users/")({
	component: UsersPage,
});

const DEFAULT_PAGE_SIZE = 20;

function UsersPage() {
	const crpc = useCRPC();
	// All users procedures are admin-only; thread the session token from
	// localStorage (guaranteed present inside _authenticated).
	const sessionToken = useSessionToken() ?? "";

	const countQuery = useQuery(crpc.users.count.queryOptions({ sessionToken }));
	const total = countQuery.data?.data?.total;

	const { pageIndex, pageSize, paginationProps } = useOffsetPagination(
		DEFAULT_PAGE_SIZE,
		total,
	);

	// `keepPreviousData` holds the previous page while the next queryKey is
	// fetching, so the table shows prior rows under antd's loading mask instead
	// of flashing an empty state.
	const pageQuery = useQuery({
		...crpc.users.list.queryOptions({
			page: pageIndex,
			pageSize,
			sessionToken,
		}),
		placeholderData: keepPreviousData,
	});

	const users: UserRow[] = useMemo(
		() =>
			(pageQuery.data?.data?.items ?? []).map((user) => ({
				id: user.id,
				username: user.username,
				name: user.name,
				role: user.role,
				activeSessionCount: user.activeSessionCount,
				lastSeenAt: user.lastSeenAt ? new Date(user.lastSeenAt) : null,
				createdAt: new Date(user.createdAt),
			})),
		[pageQuery.data],
	);

	return (
		<Flex gap={24} vertical>
			<div>
				<Typography.Title level={3} style={{ marginBlock: "0 4px" }}>
					用户
				</Typography.Title>
				<Typography.Text type="secondary">
					查看所有用户，点击用户名进入会话记录，可终止指定会话。
				</Typography.Text>
			</div>

			<UsersTable
				data={users}
				loading={pageQuery.isFetching}
				pagination={paginationProps}
			/>
		</Flex>
	);
}
