"use client";

import { useCRPC } from "@repo/app-convex/crpc";
import { extractErrorMessage } from "@repo/app-convex/errors";
import { invitationCodeInputSchema } from "@repo/backend/shared/tables/invitations";
import { Button } from "@repo/ui/components/button";
import { LoadingButton } from "@repo/ui/components/custom-ui/loading-button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

interface CreateInvitationDialogProps {
	onCreated: () => void;
}

export function CreateInvitationDialog({
	onCreated,
}: CreateInvitationDialogProps) {
	const crpc = useCRPC();
	const [open, setOpen] = useState(false);
	const [code, setCode] = useState("");
	const [codeError, setCodeError] = useState<string | null>(null);

	const createMutation = useMutation(crpc.invitations.create.mutationOptions());

	const handleCodeChange = (value: string) => {
		setCode(value);
		if (codeError) setCodeError(null);
	};

	const handleSubmit = () => {
		const trimmed = code.trim();

		let payload: { code?: string };
		if (trimmed.length === 0) {
			payload = {};
		} else {
			const parsed = invitationCodeInputSchema.safeParse(trimmed);
			if (!parsed.success) {
				setCodeError(parsed.error.issues[0]?.message ?? "邀请码无效");
				return;
			}
			payload = { code: parsed.data };
		}

		createMutation.mutate(payload, {
			onSuccess: (response) => {
				toast.success(`邀请码 ${response.data.code} 已创建`);
				setCode("");
				setCodeError(null);
				setOpen(false);
				onCreated();
			},
			onError: (err) => {
				toast.error(extractErrorMessage(err) ?? "创建失败");
			},
		});
	};

	const handleOpenChange = (next: boolean) => {
		if (createMutation.isPending) return;
		if (!next) {
			setCode("");
			setCodeError(null);
		}
		setOpen(next);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogTrigger render={<Button>新建邀请码</Button>} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>新建邀请码</DialogTitle>
					<DialogDescription>
						留空将自动生成 12 位随机邀请码，也可手动输入自定义码。
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="invitation-code">邀请码</Label>
					<Input
						autoComplete="off"
						disabled={createMutation.isPending}
						id="invitation-code"
						onChange={(e) => handleCodeChange(e.target.value)}
						placeholder="留空以自动生成"
						value={code}
					/>
					{codeError ? (
						<p className="text-destructive text-xs">{codeError}</p>
					) : null}
				</div>
				<DialogFooter>
					<DialogClose
						render={
							<Button disabled={createMutation.isPending} variant="outline">
								取消
							</Button>
						}
					/>
					<LoadingButton
						loading={createMutation.isPending}
						loadingText="创建中…"
						onClick={handleSubmit}
					>
						创建
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
