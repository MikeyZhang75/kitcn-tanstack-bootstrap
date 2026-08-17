"use client";

import { Button, Space, Table, Tag, Typography } from "antd";
import { useMemo } from "react";

import {
	dateFormat,
	renderDateTime,
	renderIpAddress,
	renderUserAgent,
} from "../../-lib/format";
import { type TablePagination, toAntdPagination } from "../../-lib/pagination";
import {
	isRevocable,
	resolveDisplayStatus,
	type SessionRow,
} from "../../-model/session-row";
import { SessionStatusBadge } from "./session-status-badge";

interface UserSessionsTableProps {
	data: SessionRow[];
	loading?: boolean;
	onRevoke: (session: SessionRow) => void;
	pagination?: TablePagination;
}

export function UserSessionsTable({
	data,
	loading,
	onRevoke,
	pagination,
}: UserSessionsTableProps) {
	const columns = useMemo(
		() => [
			{
				dataIndex: "status",
				key: "status",
				// `Date.now()` 在渲染函数里读而不是提到 memo 外：columns 只构建一次，
				// 提出去的话时间戳会冻结在挂载时刻，页面挂久了刚过期的会话仍显示活跃。
				render: (_value: unknown, row: SessionRow) => (
					<Space size={4}>
						<SessionStatusBadge
							status={resolveDisplayStatus(row, Date.now())}
						/>
						{/* 标出管理员自己正在用的这一条，避免误踢自己 */}
						{row.isCurrent ? <Tag color="blue">本机</Tag> : null}
					</Space>
				),
				title: "状态",
				width: 150,
			},
			{
				dataIndex: "ipAddress",
				key: "ipAddress",
				render: (_value: unknown, row: SessionRow) =>
					renderIpAddress(row.ipAddress),
				title: "IP",
				width: 160,
			},
			{
				dataIndex: "userAgent",
				key: "userAgent",
				render: (_value: unknown, row: SessionRow) =>
					renderUserAgent(row.userAgent),
				title: "User-Agent",
				width: 300,
			},
			{
				dataIndex: "createdAt",
				key: "createdAt",
				render: (_value: unknown, row: SessionRow) => (
					<Typography.Text type="secondary">
						{dateFormat.format(row.createdAt)}
					</Typography.Text>
				),
				title: "登录时间",
				width: 180,
			},
			{
				dataIndex: "lastSeenAt",
				key: "lastSeenAt",
				render: (_value: unknown, row: SessionRow) =>
					renderDateTime(row.lastSeenAt),
				title: "最近活跃",
				width: 180,
			},
			{
				dataIndex: "endedAt",
				key: "endedAt",
				// 谁终止的：管理员踢的显示管理员用户名，用户自己退出的只有时间。
				render: (_value: unknown, row: SessionRow) => (
					<span style={{ whiteSpace: "nowrap" }}>
						{renderDateTime(row.endedAt)}
						{row.revokedBy ? (
							<Typography.Text type="secondary">
								{` · ${row.revokedByName ?? row.revokedBy}`}
							</Typography.Text>
						) : null}
					</span>
				),
				title: "结束时间",
				width: 240,
			},
			{
				key: "actions",
				render: (_value: unknown, row: SessionRow) => (
					<Button
						danger
						disabled={!isRevocable(row, Date.now())}
						onClick={() => onRevoke(row)}
						size="small"
						type="text"
					>
						踢下线
					</Button>
				),
				title: "",
				width: 90,
			},
		],
		[onRevoke],
	);

	return (
		<Table<SessionRow>
			columns={columns}
			dataSource={data}
			loading={loading}
			locale={{ emptyText: "该用户暂无会话" }}
			pagination={toAntdPagination(pagination)}
			rowKey="id"
			scroll={{ x: "max-content" }}
		/>
	);
}
