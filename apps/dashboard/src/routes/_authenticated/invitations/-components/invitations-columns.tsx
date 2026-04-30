import type { ColumnDef } from "@tanstack/react-table";

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
}): ColumnDef<InvitationRow>[] {
	return [
		{
			accessorKey: "code",
			header: "邀请码",
			cell: ({ row }) => (
				<span className="truncate font-mono text-xs">{row.original.code}</span>
			),
		},
		{
			accessorKey: "status",
			header: "状态",
			cell: ({ row }) => <InvitationStatusBadge status={row.original.status} />,
			size: 100,
		},
		{
			accessorKey: "usedBy",
			header: "使用者",
			cell: ({ row }) => {
				// Prefer the resolved username; fall back to the raw id (user
				// since deleted) or an em-dash.
				const display = row.original.usedByName ?? row.original.usedBy;
				return (
					<span className="text-muted-foreground truncate">
						{display ?? "—"}
					</span>
				);
			},
		},
		{
			accessorKey: "createdBy",
			header: "创建者",
			cell: ({ row }) => {
				const display = row.original.createdByName ?? row.original.createdBy;
				return (
					<span className="text-muted-foreground truncate">
						{display ?? "—"}
					</span>
				);
			},
		},
		{
			accessorKey: "usedAt",
			header: "使用时间",
			cell: ({ row }) => {
				const usedAt = row.original.usedAt;
				return (
					<span className="text-muted-foreground">
						{usedAt ? dateFormat.format(usedAt) : "—"}
					</span>
				);
			},
			size: 160,
		},
		{
			accessorKey: "createdAt",
			header: "创建时间",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{dateFormat.format(row.original.createdAt)}
				</span>
			),
			size: 160,
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<InvitationRowActions
					invitation={row.original}
					onRevoke={options.onRevoke}
				/>
			),
			size: 80,
		},
	];
}
