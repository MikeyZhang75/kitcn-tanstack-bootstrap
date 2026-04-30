import type { InvitationStatus } from "@repo/backend/shared/tables/invitations";

export type InvitationRow = {
	id: string;
	code: string;
	status: InvitationStatus;
	usedAt: Date | null;
	usedBy: string | null;
	usedByName: string | null;
	createdBy: string | null;
	createdByName: string | null;
	createdAt: Date;
};
