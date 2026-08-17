"use client";

import { extractErrorMessage } from "@repo/app-convex/errors";
import { useAuthedCRPC } from "@repo/app-convex/use-authed-crpc";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { App, Flex, Typography } from "antd";
import { useCallback, useMemo, useReducer, useState } from "react";

import { CreateInvitationDialog } from "./-components/create-invitation-dialog";
import {
	InvitationsDataTable,
	type InvitationsTablePagination,
} from "./-components/invitations-data-table";
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
	// Every invitations procedure is admin-only, so this page talks to the
	// authed proxy exclusively — it injects `sessionToken` for us.
	const crpc = useAuthedCRPC();
	const { message } = App.useApp();
	const [pagination, dispatchPagination] = useReducer(
		invitationsPaginationReducer,
		DEFAULT_PAGE_SIZE,
		createInitialInvitationsPagination,
	);
	const { pageSize, pageIndex } = pagination;

	// `keepPreviousData` holds the previous page in `pageQuery.data` while the
	// next queryKey is fetching, so the table renders the prior rows (behind
	// antd Table 的 loading 遮罩) instead of flashing empty during pagination.
	// The server resolves each page in one offset-based index scan, so a jump
	// from page 0 to page N is a single WS round-trip.
	const pageQuery = useQuery({
		...crpc.invitations.list.queryOptions({ page: pageIndex, pageSize }),
		placeholderData: keepPreviousData,
	});

	const countQuery = useQuery(crpc.invitations.count.queryOptions());
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

	const paginationProps: InvitationsTablePagination | undefined = useMemo(
		() =>
			total != null
				? {
						pageIndex,
						onPageChange: handlePageChange,
						pageSize,
						onPageSizeChange: handlePageSizeChange,
						total,
					}
				: undefined,
		[total, pageIndex, pageSize, handlePageChange, handlePageSizeChange],
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
					message.success("邀请码已撤销");
					setRevoking(null);
				},
				onError: (err) => {
					message.error(extractErrorMessage(err) ?? "撤销失败");
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
		<Flex gap={24} vertical>
			<Flex align="flex-start" gap={16} justify="space-between">
				<div>
					<Typography.Title level={3} style={{ marginBlock: "0 4px" }}>
						邀请码管理
					</Typography.Title>
					<Typography.Text type="secondary">
						创建并管理用于注册的邀请码。
					</Typography.Text>
				</div>
				<CreateInvitationDialog onCreated={handleCreated} />
			</Flex>

			<InvitationsDataTable
				data={invitations}
				loading={pageQuery.isFetching}
				onRevoke={handleRevoke}
				pagination={paginationProps}
			/>

			<RevokeInvitationDialog
				invitation={revoking}
				isPending={revokeMutation.isPending}
				onConfirm={handleRevokeConfirm}
				onOpenChange={(next) => {
					if (!next) setRevoking(null);
				}}
			/>
		</Flex>
	);
}
