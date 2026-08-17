"use client";

import { Modal, Typography } from "antd";

interface RevokeAllDialogProps {
	open: boolean;
	/** 目标用户名，仅用于文案 */
	username: string;
	/** 目标是不是当前登录的管理员自己 */
	isSelf: boolean;
	isPending: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
}

export function RevokeAllDialog({
	open,
	username,
	isSelf,
	isPending,
	onConfirm,
	onOpenChange,
}: RevokeAllDialogProps) {
	return (
		<Modal
			cancelButtonProps={{ disabled: isPending }}
			confirmLoading={isPending}
			mask={{ closable: !isPending }}
			okButtonProps={{ danger: true }}
			okText="确认全部终止"
			onCancel={() => {
				if (isPending) return;
				onOpenChange(false);
			}}
			onOk={onConfirm}
			open={open}
			title="确认终止全部会话"
		>
			<Typography.Paragraph>
				<Typography.Text strong>{username}</Typography.Text>{" "}
				当前所有活跃会话都会被终止，相关设备需要重新登录。
			</Typography.Paragraph>
			{isSelf ? (
				<Typography.Paragraph type="secondary">
					你当前正在使用的这个会话不会被终止，操作后你仍然保持登录。
				</Typography.Paragraph>
			) : null}
		</Modal>
	);
}
