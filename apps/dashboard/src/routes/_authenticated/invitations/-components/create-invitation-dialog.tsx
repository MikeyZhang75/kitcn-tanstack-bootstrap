"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { useSessionToken } from "@repo/app-convex/use-session";
import { invitationCodeInputSchema } from "@repo/backend/shared/tables/invitations";
import { useMutation } from "@tanstack/react-query";
import type { FormRule } from "antd";
import { App, Button, Form, Input, Modal, Typography } from "antd";
import { useState } from "react";

interface CreateInvitationDialogProps {
	onCreated: () => void;
}

type CreateInvitationValues = {
	code?: string;
};

// 自定义码是可选的：留空走后端自动生成，所以空值直接放行，只有真的填了内容
// 才用后端那份 schema 校验（长度 / 字符集 / 中文文案都在它身上）。
const optionalCodeRule: FormRule = {
	validator: (_rule, value: unknown) => {
		const trimmed = typeof value === "string" ? value.trim() : "";
		if (trimmed.length === 0) return Promise.resolve();
		const result = invitationCodeInputSchema.safeParse(trimmed);
		if (result.success) return Promise.resolve();
		return Promise.reject(new Error(result.error.issues[0]?.message));
	},
};

export function CreateInvitationDialog({
	onCreated,
}: CreateInvitationDialogProps) {
	const crpc = useCRPC();
	const { message } = App.useApp();
	const sessionToken = useSessionToken() ?? "";
	const [open, setOpen] = useState(false);
	const [form] = Form.useForm<CreateInvitationValues>();

	const createMutation = useMutation(crpc.invitations.create.mutationOptions());

	const handleFinish = (values: CreateInvitationValues) => {
		const trimmed = values.code?.trim() ?? "";

		createMutation.mutate(
			trimmed.length === 0 ? { sessionToken } : { code: trimmed, sessionToken },
			{
				onSuccess: (response) => {
					message.success(`邀请码 ${response.data.code} 已创建`);
					form.resetFields();
					setOpen(false);
					onCreated();
				},
				onError: (err) => {
					message.error(extractErrorMessage(err) ?? "创建失败");
				},
			},
		);
	};

	const handleCancel = () => {
		if (createMutation.isPending) return;
		form.resetFields();
		setOpen(false);
	};

	return (
		<>
			<Button onClick={() => setOpen(true)} type="primary">
				新建邀请码
			</Button>
			<Modal
				confirmLoading={createMutation.isPending}
				destroyOnHidden
				mask={{ closable: !createMutation.isPending }}
				okText="创建"
				onCancel={handleCancel}
				onOk={() => form.submit()}
				open={open}
				title="新建邀请码"
			>
				<Typography.Paragraph type="secondary">
					留空将自动生成 12 位随机邀请码，也可手动输入自定义码。
				</Typography.Paragraph>
				<Form<CreateInvitationValues>
					disabled={createMutation.isPending}
					form={form}
					layout="vertical"
					onFinish={handleFinish}
				>
					<Form.Item label="邀请码" name="code" rules={[optionalCodeRule]}>
						<Input autoComplete="off" placeholder="留空以自动生成" />
					</Form.Item>
				</Form>
			</Modal>
		</>
	);
}
