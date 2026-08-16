import {
	INVITATION_STATUS_LABELS,
	type InvitationStatus,
} from "@repo/backend/shared/tables/invitations";
import type { BadgeProps } from "antd";
import { Badge } from "antd";

import { INVITATION_STATUS_BADGE } from "../-lib/status-labels";

type InvitationStatusBadgeProps = {
	status: InvitationStatus;
} & Omit<BadgeProps, "status" | "text">;

function InvitationStatusBadge({
	status,
	...props
}: InvitationStatusBadgeProps) {
	return (
		<Badge
			status={INVITATION_STATUS_BADGE[status]}
			text={INVITATION_STATUS_LABELS[status]}
			{...props}
		/>
	);
}

export { InvitationStatusBadge, type InvitationStatusBadgeProps };
