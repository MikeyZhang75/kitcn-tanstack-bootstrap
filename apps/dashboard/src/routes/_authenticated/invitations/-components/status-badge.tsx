import {
	INVITATION_STATUS_LABELS,
	type InvitationStatus,
} from "@repo/backend/shared/tables/invitations";
import { Badge } from "@repo/ui/components/badge";

import { INVITATION_STATUS_DOT_COLOR } from "../-lib/status-labels";

type InvitationStatusBadgeProps = {
	status: InvitationStatus;
} & Omit<React.ComponentProps<typeof Badge>, "variant" | "children">;

function InvitationStatusBadge({
	status,
	...props
}: InvitationStatusBadgeProps) {
	return (
		<Badge className="gap-1.5 border-0 px-0" variant="outline" {...props}>
			<span
				aria-hidden="true"
				className={`size-1.5 rounded-full ${INVITATION_STATUS_DOT_COLOR[status]}`}
			/>
			{INVITATION_STATUS_LABELS[status]}
		</Badge>
	);
}

export { InvitationStatusBadge, type InvitationStatusBadgeProps };
