"use client";

import { Modal, Typography } from "antd";

import { dateFormat } from "../../-lib/format";
import type { SessionRow } from "../../-model/session-row";

interface RevokeSessionDialogProps {
	session: SessionRow | null;
	isPending: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}

export function RevokeSessionDialog({
	session,
	isPending,
	onConfirm,
	onOpenChange,
}: RevokeSessionDialogProps) {
	return (
		<Modal
			cancelButtonProps={{ disabled: isPending }}
			confirmLoading={isPending}
			mask={{ closable: !isPending }}
			okButtonProps={{ danger: true }}
			okText="确认终止"
			onCancel={() => {
				if (isPending) return;
				onOpenChange(false);
			}}
			onOk={onConfirm}
			open={session != null}
			title="确认终止会话"
		>
			<Typography.Paragraph>
				终止后该设备会立即被登出，需要重新登录。会话记录会保留。
			</Typography.Paragraph>
			{session?.isCurrent ? (
				<Typography.Paragraph type="danger">
					这就是你当前正在使用的会话，终止后你会立即被登出。
				</Typography.Paragraph>
			) : null}
			{session ? (
				<Typography.Paragraph type="secondary">
					登录时间：{dateFormat.format(session.createdAt)}
					<br />
					IP：{session.ipAddress ?? "—"}
				</Typography.Paragraph>
			) : null}
		</Modal>
	);
}
