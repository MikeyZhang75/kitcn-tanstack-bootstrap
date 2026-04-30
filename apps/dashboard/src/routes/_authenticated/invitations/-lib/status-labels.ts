import type { InvitationStatus } from "@repo/backend/shared/tables/invitations";

export const INVITATION_STATUS_DOT_COLOR: Record<InvitationStatus, string> = {
	active: "bg-emerald-500",
	used: "bg-slate-400",
	revoked: "bg-red-500",
};
