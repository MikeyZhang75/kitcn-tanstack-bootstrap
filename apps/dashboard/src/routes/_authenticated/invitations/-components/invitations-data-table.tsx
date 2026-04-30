"use client";

import {
	DataTable,
	type DataTablePagination,
} from "@repo/ui/components/custom-ui/data-table";
import { cn } from "@repo/ui/lib/utils";
import { useMemo } from "react";

import type { InvitationRow } from "../-model/invitation-row";
import { createInvitationsColumns } from "./invitations-columns";

interface InvitationsDataTableProps {
	data: InvitationRow[];
	onRevoke: (invitation: InvitationRow) => void;
	pagination?: DataTablePagination;
}

export function InvitationsDataTable({
	data,
	onRevoke,
	pagination,
}: InvitationsDataTableProps) {
	const columns = useMemo(
		() => createInvitationsColumns({ onRevoke }),
		[onRevoke],
	);
	return (
		<DataTable
			bodyClassName="grid min-h-0 overflow-y-auto"
			columns={columns}
			containerClassName={cn(
				"min-w-0 min-h-0 flex-1",
				"[&>div:first-child]:flex [&>div:first-child]:flex-col",
				"[&>div:first-child]:min-h-0",
				"[&_table]:h-full [&_table]:grid-rows-[auto_minmax(0,max-content)]",
			)}
			data={data}
			emptyText="暂无邀请码"
			pagination={pagination}
		/>
	);
}
