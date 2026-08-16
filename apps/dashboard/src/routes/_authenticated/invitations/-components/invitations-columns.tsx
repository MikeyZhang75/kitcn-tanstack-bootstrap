import type { TableColumnsType } from "antd";
import { Flex, Typography } from "antd";

import type { InvitationRow } from "../-model/invitation-row";
import { InvitationRowActions } from "./invitation-row-actions";
import { InvitationStatusBadge } from "./status-badge";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

export function createInvitationsColumns(options: {
	onRevoke: (invitation: InvitationRow) => void;
}): TableColumnsType<InvitationRow> {
	return [
		{
			dataIndex: "code",
			key: "code",
			// 复制按钮紧跟在码后面：不传 children 时 antd 只渲染图标按钮（并自带
			// 复制成功后的 ✓ 状态与 4px 间距），提示文案由 zh_CN locale 提供。
			render: (_value, row) => (
				<Flex align="center" wrap={false} gap={"small"}>
					<Typography.Text code>{row.code}</Typography.Text>
					<Typography.Text copyable={{ text: row.code }} />
				</Flex>
			),
			title: "邀请码",
		},
		{
			dataIndex: "status",
			key: "status",
			render: (_value, row) => <InvitationStatusBadge status={row.status} />,
			title: "状态",
			width: 110,
		},
		{
			dataIndex: "usedBy",
			key: "usedBy",
			// 优先显示解析出来的用户名；用户已被删除时退回原始 id，再没有就画横杠。
			render: (_value, row) => (
				<Typography.Text type="secondary">
					{row.usedByName ?? row.usedBy ?? "—"}
				</Typography.Text>
			),
			title: "使用者",
		},
		{
			dataIndex: "createdBy",
			key: "createdBy",
			render: (_value, row) => (
				<Typography.Text type="secondary">
					{row.createdByName ?? row.createdBy ?? "—"}
				</Typography.Text>
			),
			title: "创建者",
		},
		{
			dataIndex: "usedAt",
			key: "usedAt",
			render: (_value, row) => (
				<Typography.Text type="secondary">
					{row.usedAt ? dateFormat.format(row.usedAt) : "—"}
				</Typography.Text>
			),
			title: "使用时间",
			width: 180,
		},
		{
			dataIndex: "createdAt",
			key: "createdAt",
			render: (_value, row) => (
				<Typography.Text type="secondary">
					{dateFormat.format(row.createdAt)}
				</Typography.Text>
			),
			title: "创建时间",
			width: 180,
		},
		{
			key: "actions",
			render: (_value, row) => (
				<InvitationRowActions invitation={row} onRevoke={options.onRevoke} />
			),
			title: "",
			width: 90,
		},
	];
}
