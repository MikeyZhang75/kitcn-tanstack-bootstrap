import {
	SESSION_EXPIRED_LABEL,
	SESSION_STATUS_LABELS,
} from "@repo/backend/shared/tables/session";
import type { BadgeProps } from "antd";
import { Badge } from "antd";

import type { SessionDisplayStatus } from "../../-model/session-row";

// 「已过期」不是存储状态，所以标签在这里补上；其余三种直接用后端的中文映射，
// 保证前后端文案同源。
const STATUS_BADGE: Record<SessionDisplayStatus, BadgeProps["status"]> = {
	active: "success",
	expired: "default",
	signed_out: "default",
	revoked: "error",
};

const STATUS_LABELS: Record<SessionDisplayStatus, string> = {
	...SESSION_STATUS_LABELS,
	expired: SESSION_EXPIRED_LABEL,
};

export function SessionStatusBadge({
	status,
}: {
	status: SessionDisplayStatus;
}) {
	return <Badge status={STATUS_BADGE[status]} text={STATUS_LABELS[status]} />;
}
