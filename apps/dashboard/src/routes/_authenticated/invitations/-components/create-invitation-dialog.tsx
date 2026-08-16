"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { useSessionToken } from "@repo/app-convex/use-session";
import {
	createInvitationInputSchema,
	DEFAULT_INVITATION_CREATE_COUNT,
	GENERATED_INVITATION_CODE_LENGTH,
	INVITATION_CREATE_COUNT_MAX,
	INVITATION_CREATE_COUNT_MIN,
} from "@repo/backend/shared/tables/invitations";
import { useMutation } from "@tanstack/react-query";
import type { FormRule } from "antd";
import { App, Button, Form, InputNumber, Modal, Typography } from "antd";
import { useState } from "react";

interface CreateInvitationDialogProps {
	onCreated: () => void;
}

type CreateInvitationValues = {
	count: number;
};

// 上下限和中文文案都在后端 schema 上，前端不再复述一遍 min / max / message。
// InputNumber 被清空时给的是 null，这里不做兜底，直接丢给 schema，让「没填」
// 也走它自己的中文文案而不是 antd 的通用 required 模板。
const countRule: FormRule = {
	validator: (_rule, value: unknown) => {
		const result = createInvitationInputSchema.shape.count.safeParse(value);
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
		createMutation.mutate(
			{ count: values.count, sessionToken },
			{
				onSuccess: (response) => {
					const { codes } = response.data;
					const [first] = codes;
					// 单个时把码直接念出来（最常见的操作是生成一个然后发出去）；
					// 批量时只报数量，剩下的去表格里看。
					message.success(
						codes.length === 1 && first
							? `邀请码 ${first} 已创建`
							: `已创建 ${codes.length} 个邀请码`,
					);
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
					邀请码由系统随机生成（{GENERATED_INVITATION_CODE_LENGTH}{" "}
					位，不含易混淆字符），不支持自定义。填写数量可一次生成多个。
				</Typography.Paragraph>
				<Form<CreateInvitationValues>
					disabled={createMutation.isPending}
					form={form}
					initialValues={{ count: DEFAULT_INVITATION_CREATE_COUNT }}
					layout="vertical"
					onFinish={handleFinish}
				>
					<Form.Item label="创建数量" name="count" rules={[countRule]}>
						<InputNumber
							autoFocus
							max={INVITATION_CREATE_COUNT_MAX}
							min={INVITATION_CREATE_COUNT_MIN}
							precision={0}
							step={1}
							style={{ width: "100%" }}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</>
	);
}
