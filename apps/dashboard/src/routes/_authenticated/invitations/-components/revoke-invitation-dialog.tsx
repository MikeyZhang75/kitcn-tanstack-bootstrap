"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { LoadingButton } from "@repo/ui/components/custom-ui/loading-button";

import type { InvitationRow } from "../-model/invitation-row";

interface RevokeInvitationDialogProps {
	invitation: InvitationRow | null;
	isPending: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}

export function RevokeInvitationDialog({
	invitation,
	isPending,
	onConfirm,
	onOpenChange,
}: RevokeInvitationDialogProps) {
	return (
		<AlertDialog
			onOpenChange={(next) => {
				if (isPending) return;
				onOpenChange(next);
			}}
			open={invitation != null}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>确认撤销邀请码</AlertDialogTitle>
					<AlertDialogDescription>
						撤销后 <span className="font-mono">{invitation?.code}</span>{" "}
						将无法再用于注册，且该操作不可恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
					<LoadingButton
						data-slot="alert-dialog-action"
						loading={isPending}
						loadingText="撤销中…"
						onClick={onConfirm}
					>
						确认撤销
					</LoadingButton>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
