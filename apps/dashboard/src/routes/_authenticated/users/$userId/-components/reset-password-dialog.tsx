"use client";

import {
	PASSWORD_MIN_LENGTH,
	resetPasswordInputSchema,
} from "@repo/backend/shared/tables/user";
import { Form, Input, Modal, Typography } from "antd";

import { matchesFieldRule, zodStringRule } from "@/lib/zod-rule";

export type ResetPasswordValues = {
	newPassword: string;
	confirmPassword: string;
};

interface ResetPasswordDialogProps {
	open: boolean;
	/** 目标用户名，仅用于文案 */
	username: string;
	isPending: boolean;
	onConfirm: (newPassword: string) => void;
	onOpenChange: (open: boolean) => void;
}

const newPasswordRule = zodStringRule(
	resetPasswordInputSchema.shape.newPassword,
);

const confirmPasswordRule = matchesFieldRule(
	"newPassword",
	"两次输入的密码不一致",
);

export function ResetPasswordDialog({
	open,
	username,
	isPending,
	onConfirm,
	onOpenChange,
}: ResetPasswordDialogProps) {
	const [form] = Form.useForm<ResetPasswordValues>();

	const handleFinish = (values: ResetPasswordValues) => {
		onConfirm(values.newPassword);
	};

	const handleCancel = () => {
		if (isPending) return;
		onOpenChange(false);
	};

	return (
		<Modal
			// 清表单挂在 afterClose 而不是 handleCancel：成功时是父组件把 open 置 false
			// 的，走不到 onCancel。`destroyOnHidden` 只卸载字段，`Form.useForm()` 的
			// store 活在本组件里且 preserve 默认为 true —— 不清的话明文新密码会一直留在
			// 内存里，下次打开还会自动回填。
			afterClose={() => form.resetFields()}
			cancelButtonProps={{ disabled: isPending }}
			confirmLoading={isPending}
			destroyOnHidden
			mask={{ closable: !isPending }}
			okButtonProps={{ danger: true }}
			okText="确认重置"
			onCancel={handleCancel}
			onOk={() => form.submit()}
			open={open}
			title="重置密码"
		>
			<Typography.Paragraph>
				为 <Typography.Text strong>{username}</Typography.Text>{" "}
				设置一个新密码。重置后该用户的
				<Typography.Text strong>全部会话立即终止</Typography.Text>
				，所有设备都需要用新密码重新登录。
			</Typography.Paragraph>
			<Typography.Paragraph type="secondary">
				新密码不会再次展示，请设置后自行告知该用户。
			</Typography.Paragraph>
			<Form<ResetPasswordValues>
				disabled={isPending}
				form={form}
				layout="vertical"
				onFinish={handleFinish}
				requiredMark={false}
			>
				<Form.Item label="新密码" name="newPassword" rules={[newPasswordRule]}>
					<Input.Password
						autoComplete="new-password"
						autoFocus
						placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
					/>
				</Form.Item>

				<Form.Item
					dependencies={["newPassword"]}
					label="确认新密码"
					name="confirmPassword"
					rules={[newPasswordRule, confirmPasswordRule]}
				>
					<Input.Password
						autoComplete="new-password"
						placeholder="请再次输入新密码"
					/>
				</Form.Item>
			</Form>
		</Modal>
	);
}
