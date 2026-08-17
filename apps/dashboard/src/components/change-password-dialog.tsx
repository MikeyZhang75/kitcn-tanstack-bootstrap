"use client";

import { extractErrorMessage } from "@repo/app-convex/errors";
import { setSessionToken } from "@repo/app-convex/session-store";
import { useAuthedCRPC } from "@repo/app-convex/use-authed-crpc";
import {
	changePasswordInputSchema,
	PASSWORD_MIN_LENGTH,
} from "@repo/backend/shared/tables/user";
import { useMutation } from "@tanstack/react-query";
import { App, Form, Input, Modal, Typography } from "antd";

import { matchesFieldRule, zodStringRule } from "@/lib/zod-rule";

interface ChangePasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type ChangePasswordValues = {
	currentPassword: string;
	newPassword: string;
	confirmPassword: string;
};

// 长度约束和中文文案都在后端 schema 上，这里只做转接。
const currentPasswordRule = zodStringRule(
	changePasswordInputSchema.shape.currentPassword,
);
const newPasswordRule = zodStringRule(
	changePasswordInputSchema.shape.newPassword,
);

const confirmPasswordRule = matchesFieldRule(
	"newPassword",
	"两次输入的密码不一致",
);

/**
 * 自助修改密码。入口在侧边栏底部的用户菜单里（`nav-user.tsx`）。
 *
 * 两个 app 逐字一致，任何改动都要同步镜像 —— 见 docs/frontend-architecture.md。
 */
export function ChangePasswordDialog({
	open,
	onOpenChange,
}: ChangePasswordDialogProps) {
	// 改密码是已鉴权过程，走 authed 代理：`sessionToken` 在边界注入，调用点不出现。
	const crpc = useAuthedCRPC();
	const { message } = App.useApp();
	const [form] = Form.useForm<ChangePasswordValues>();

	const changeMutation = useMutation(
		crpc.account.changePassword.mutationOptions(),
	);

	const handleFinish = (values: ChangePasswordValues) => {
		changeMutation.mutate(
			{
				currentPassword: values.currentPassword,
				newPassword: values.newPassword,
			},
			{
				onSuccess: (response) => {
					// ⚠️ 必须是这里的第一件事。后端把旧会话（含本机这一个）全部作废并
					// 重新签发了令牌 —— 本机原来那串 token 从此无效，被拷走的副本也一起
					// 失效。Convex 会把 mutation 的返回值和 `session.me` 变成
					// UNAUTHORIZED 这两件事放进同一个 React 批次里（convex 的
					// `removeCompleted` 只在查询集推进到该时间戳后才 resolve mutation），
					// 所以先换掉令牌，`session.me` 就会以新 key 重新订阅并回到
					// `isPending`，`_authenticated` 的「token 在但查不到 user」清理逻辑
					// 便不会触发。顺序反过来就会被踢回 /auth。
					setSessionToken(response.data.sessionToken);

					const { revokedSessions } = response.data;
					message.success(
						revokedSessions > 0
							? `密码已修改，已退出其他 ${revokedSessions} 个设备`
							: "密码已修改",
					);
					onOpenChange(false);
				},
				onError: (err) => {
					message.error(extractErrorMessage(err) ?? "修改失败");
				},
			},
		);
	};

	const handleCancel = () => {
		if (changeMutation.isPending) return;
		onOpenChange(false);
	};

	return (
		<Modal
			// 清表单挂在 afterClose，覆盖所有关闭路径（确定 / 取消 / Esc / 点遮罩）。
			// `destroyOnHidden` 只卸载字段，`Form.useForm()` 的 store 活在本组件里且
			// preserve 默认为 true —— 不清的话明文密码会一直留在内存里，下次打开还会
			// 自动回填。
			afterClose={() => form.resetFields()}
			cancelButtonProps={{ disabled: changeMutation.isPending }}
			confirmLoading={changeMutation.isPending}
			destroyOnHidden
			mask={{ closable: !changeMutation.isPending }}
			okText="确认修改"
			onCancel={handleCancel}
			onOk={() => form.submit()}
			open={open}
			title="修改密码"
		>
			<Typography.Paragraph type="secondary">
				修改成功后，其他设备上的登录会被强制退出；当前设备保持登录，但会重新签发登录凭据。
			</Typography.Paragraph>
			<Form<ChangePasswordValues>
				disabled={changeMutation.isPending}
				form={form}
				layout="vertical"
				onFinish={handleFinish}
				requiredMark={false}
			>
				<Form.Item
					label="当前密码"
					name="currentPassword"
					rules={[currentPasswordRule]}
				>
					<Input.Password
						autoComplete="current-password"
						autoFocus
						placeholder="请输入当前密码"
					/>
				</Form.Item>

				<Form.Item label="新密码" name="newPassword" rules={[newPasswordRule]}>
					<Input.Password
						autoComplete="new-password"
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
