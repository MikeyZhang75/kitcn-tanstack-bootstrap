"use client";

import { Modal, Typography } from "antd";

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
		<Modal
			cancelButtonProps={{ disabled: isPending }}
			confirmLoading={isPending}
			mask={{ closable: !isPending }}
			okButtonProps={{ danger: true }}
			okText="确认撤销"
			onCancel={() => {
				if (isPending) return;
				onOpenChange(false);
			}}
			onOk={onConfirm}
			open={invitation != null}
			title="确认撤销邀请码"
		>
			<Typography.Paragraph>
				撤销后 <Typography.Text code>{invitation?.code}</Typography.Text>{" "}
				将无法再用于注册，且该操作不可恢复。
			</Typography.Paragraph>
		</Modal>
	);
}
