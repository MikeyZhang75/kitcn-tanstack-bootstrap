"use client";

import { Link } from "@tanstack/react-router";
import { Badge, Table, Tag, Typography } from "antd";
import { useMemo } from "react";

import { dateFormat, renderDateTime } from "../-lib/format";
import { type TablePagination, toAntdPagination } from "../-lib/pagination";
import type { UserRow } from "../-model/user-row";

interface UsersTableProps {
	data: UserRow[];
	loading?: boolean;
	pagination?: TablePagination;
}

export function UsersTable({ data, loading, pagination }: UsersTableProps) {
	const columns = useMemo(
		() => [
			{
				dataIndex: "username",
				key: "username",
				render: (_value: unknown, row: UserRow) => (
					<Link params={{ userId: row.id }} to="/users/$userId">
						{row.username}
					</Link>
				),
				title: "用户名",
			},
			{
				dataIndex: "name",
				key: "name",
				render: (_value: unknown, row: UserRow) => (
					<Typography.Text>{row.name}</Typography.Text>
				),
				title: "姓名",
			},
			{
				dataIndex: "role",
				key: "role",
				render: (_value: unknown, row: UserRow) => (
					<Tag color={row.role === "admin" ? "gold" : undefined}>
						{row.role === "admin" ? "管理员" : "用户"}
					</Tag>
				),
				title: "角色",
				width: 100,
			},
			{
				dataIndex: "activeSessionCount",
				key: "activeSessionCount",
				render: (_value: unknown, row: UserRow) =>
					row.activeSessionCount > 0 ? (
						<Badge status="success" text={`${row.activeSessionCount} 个`} />
					) : (
						<Badge status="default" text="无" />
					),
				title: "活跃会话",
				width: 120,
			},
			{
				dataIndex: "lastSeenAt",
				key: "lastSeenAt",
				render: (_value: unknown, row: UserRow) =>
					renderDateTime(row.lastSeenAt),
				title: "最近活跃",
				width: 180,
			},
			{
				dataIndex: "createdAt",
				key: "createdAt",
				render: (_value: unknown, row: UserRow) => (
					<Typography.Text type="secondary">
						{dateFormat.format(row.createdAt)}
					</Typography.Text>
				),
				title: "注册时间",
				width: 180,
			},
		],
		[],
	);

	return (
		<Table<UserRow>
			columns={columns}
			dataSource={data}
			loading={loading}
			locale={{ emptyText: "暂无用户" }}
			pagination={toAntdPagination(pagination)}
			rowKey="id"
			scroll={{ x: "max-content" }}
		/>
	);
}
