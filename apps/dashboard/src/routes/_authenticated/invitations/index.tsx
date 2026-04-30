"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import type { DataTablePagination } from "@repo/ui/components/custom-ui/data-table";
import { Skeleton } from "@repo/ui/components/skeleton";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";

import { CreateInvitationDialog } from "./-components/create-invitation-dialog";
import { InvitationsDataTable } from "./-components/invitations-data-table";
import { RevokeInvitationDialog } from "./-components/revoke-invitation-dialog";
import type { InvitationRow } from "./-model/invitation-row";
import {
	createInitialInvitationsPagination,
	invitationsPaginationReducer,
} from "./-model/invitations-pagination";

export const Route = createFileRoute("/_authenticated/invitations/")({
	component: InvitationsPage,
});

const DEFAULT_PAGE_SIZE = 20;

function InvitationsPage() {
	const crpc = useCRPC();
	const [pagination, dispatchPagination] = useReducer(
		invitationsPaginationReducer,
		DEFAULT_PAGE_SIZE,
		createInitialInvitationsPagination,
	);
	const { pageSize, pageIndex } = pagination;

	// `keepPreviousData` holds the previous page in `pageQuery.data` while the
	// next queryKey is fetching, so the table renders the prior rows instead
	// of flashing empty during pagination. The server resolves each page in
	// one offset-based index scan, so a jump from page 0 to page N is a
	// single WS round-trip.
	const pageQuery = useQuery({
		...crpc.invitations.list.queryOptions({ page: pageIndex, pageSize }),
		placeholderData: keepPreviousData,
	});

	const countQuery = useQuery(crpc.invitations.count.queryOptions({}));
	const total = countQuery.data?.data?.total;

	const invitations: InvitationRow[] = useMemo(
		() =>
			(pageQuery.data?.data?.items ?? []).map((invitation) => ({
				id: invitation.id,
				code: invitation.code,
				status: invitation.status,
				usedAt: invitation.usedAt ? new Date(invitation.usedAt) : null,
				usedBy: invitation.usedBy ?? null,
				usedByName: invitation.usedByName ?? null,
				createdBy: invitation.createdBy ?? null,
				createdByName: invitation.createdByName ?? null,
				createdAt: new Date(invitation.createdAt),
			})),
		[pageQuery.data],
	);

	const isLoadingFirstPage =
		pageIndex === 0 && pageQuery.isPending && pageQuery.data == null;

	const handlePageChange = useCallback(
		(target: number) => {
			if (target < 0) return;
			if (total != null) {
				const maxIndex = Math.max(0, Math.ceil(total / pageSize) - 1);
				if (target > maxIndex) return;
			}
			dispatchPagination({ type: "change_page", pageIndex: target });
		},
		[total, pageSize],
	);

	const handlePageSizeChange = useCallback(
		(size: number) =>
			dispatchPagination({ type: "change_page_size", pageSize: size }),
		[],
	);

	const paginationProps: DataTablePagination | undefined = useMemo(
		() =>
			total != null
				? {
						pageIndex,
						isFetching: pageQuery.isFetching,
						onPageChange: handlePageChange,
						pageSize,
						onPageSizeChange: handlePageSizeChange,
						total,
					}
				: undefined,
		[
			total,
			pageIndex,
			pageQuery.isFetching,
			pageSize,
			handlePageChange,
			handlePageSizeChange,
		],
	);

	const [revoking, setRevoking] = useState<InvitationRow | null>(null);
	const revokeMutation = useMutation(crpc.invitations.revoke.mutationOptions());

	const handleRevoke = useCallback((invitation: InvitationRow) => {
		setRevoking(invitation);
	}, []);

	const handleRevokeConfirm = () => {
		if (!revoking) return;
		revokeMutation.mutate(
			{ id: revoking.id },
			{
				onSuccess: () => {
					toast.success("邀请码已撤销");
					setRevoking(null);
				},
				onError: (err) => {
					toast.error(extractErrorMessage(err) ?? "撤销失败");
				},
			},
		);
	};

	// Jump back to page 0 after a successful create so the new row — which
	// lands at the top of the descending-order list — is actually visible.
	const handleCreated = () => {
		dispatchPagination({ type: "change_page", pageIndex: 0 });
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-6">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">邀请码管理</h1>
					<p className="text-muted-foreground text-sm">
						创建并管理用于注册的邀请码。
					</p>
				</div>
				<CreateInvitationDialog onCreated={handleCreated} />
			</header>

			{isLoadingFirstPage ? (
				<div className="space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : (
				<InvitationsDataTable
					data={invitations}
					onRevoke={handleRevoke}
					pagination={paginationProps}
				/>
			)}

			<RevokeInvitationDialog
				invitation={revoking}
				isPending={revokeMutation.isPending}
				onConfirm={handleRevokeConfirm}
				onOpenChange={(next) => {
					if (!next) setRevoking(null);
				}}
			/>
		</div>
	);
}
