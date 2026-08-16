import type { InvitationStatus } from "@repo/backend/shared/tables/invitations";
import type { BadgeProps } from "antd";

// 状态 → antd Badge 的预设状态色。文案走后端的
// `INVITATION_STATUS_LABELS`，这里只负责颜色映射。
export const INVITATION_STATUS_BADGE: Record<
	InvitationStatus,
	NonNullable<BadgeProps["status"]>
> = {
	active: "success",
	used: "default",
	revoked: "error",
};
