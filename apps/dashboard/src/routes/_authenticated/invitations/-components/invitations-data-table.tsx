"use client";

import { Table } from "antd";
import { useMemo } from "react";

import type { InvitationRow } from "../-model/invitation-row";
import { createInvitationsColumns } from "./invitations-columns";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export interface InvitationsTablePagination {
	/** 从 0 开始的当前页；antd 的 `current` 从 1 开始，这里在组件内换算 */
	pageIndex: number;
	pageSize: number;
	/** 全量行数，由 `invitations.count` 提供 */
	total: number;
	onPageChange: (pageIndex: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}

interface InvitationsDataTableProps {
	data: InvitationRow[];
	loading?: boolean;
	onRevoke: (invitation: InvitationRow) => void;
	pagination?: InvitationsTablePagination;
}

export function InvitationsDataTable({
	data,
	loading,
	onRevoke,
	pagination,
}: InvitationsDataTableProps) {
	const columns = useMemo(
		() => createInvitationsColumns({ onRevoke }),
		[onRevoke],
	);

	return (
		<Table<InvitationRow>
			columns={columns}
			dataSource={data}
			loading={loading}
			locale={{ emptyText: "暂无邀请码" }}
			pagination={
				pagination
					? {
							current: pagination.pageIndex + 1,
							// antd 在改页长时也会触发 onChange，所以先判断页长有没有变：
							// 变了就走 change_page_size（reducer 会顺带把页码归零），
							// 没变才是单纯翻页。
							onChange: (page, size) => {
								if (size !== pagination.pageSize) {
									pagination.onPageSizeChange(size);
									return;
								}
								pagination.onPageChange(page - 1);
							},
							pageSize: pagination.pageSize,
							pageSizeOptions: PAGE_SIZE_OPTIONS,
							showSizeChanger: true,
							showTotal: (total) => `共 ${total} 条`,
							total: pagination.total,
						}
					: false
			}
			rowKey="id"
			scroll={{ x: "max-content" }}
		/>
	);
}
