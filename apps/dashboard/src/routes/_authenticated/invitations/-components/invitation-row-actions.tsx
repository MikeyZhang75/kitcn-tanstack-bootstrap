import { Button } from "antd";

import type { InvitationRow } from "../-model/invitation-row";

interface InvitationRowActionsProps {
	invitation: InvitationRow;
	onRevoke: (invitation: InvitationRow) => void;
}

export function InvitationRowActions({
	invitation,
	onRevoke,
}: InvitationRowActionsProps) {
	// 只有 active 的码可以撤销；used / revoked 都是终态。
	const revocable = invitation.status === "active";
	return (
		<Button
			disabled={!revocable}
			onClick={() => onRevoke(invitation)}
			size="small"
			type="link"
		>
			撤销
		</Button>
	);
}
