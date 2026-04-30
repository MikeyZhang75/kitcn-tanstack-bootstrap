import { Button } from "@repo/ui/components/button";

import type { InvitationRow } from "../-model/invitation-row";

interface InvitationRowActionsProps {
	invitation: InvitationRow;
	onRevoke: (invitation: InvitationRow) => void;
}

export function InvitationRowActions({
	invitation,
	onRevoke,
}: InvitationRowActionsProps) {
	const revocable = invitation.status === "active";
	return (
		<Button
			disabled={!revocable}
			onClick={() => onRevoke(invitation)}
			size="sm"
			variant="ghost"
		>
			撤销
		</Button>
	);
}
