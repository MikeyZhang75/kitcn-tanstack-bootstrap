import type { SessionStatus } from "@repo/backend/shared/tables/session";

export type SessionRow = {
	id: string;
	status: SessionStatus;
	expiresAt: Date;
	/** 心跳时间；从未心跳过为 null */
	lastSeenAt: Date | null;
	/** 离开 active 的时刻（用户退出或管理员终止） */
	endedAt: Date | null;
	/** 终止该会话的管理员 id / 用户名；用户自己退出或自助改密时为 null */
	revokedBy: string | null;
	revokedByName: string | null;
	/** 建会话时的请求元数据，可能缺失 —— 见 backend shared/tables/session.ts */
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
	/** 是不是当前这个管理员正在使用的会话（后端按 ctx.session.id 判定） */
	isCurrent: boolean;
};

/**
 * 界面上的五态：`status` 四种再加一个「已过期」——后者不是存储状态，而是
 * `active` 且已过 `expiresAt` 推导出来的（做成状态就得靠 cron 维护）。
 */
export type SessionDisplayStatus = SessionStatus | "expired";

export function resolveDisplayStatus(
	row: Pick<SessionRow, "status" | "expiresAt">,
	now: number,
): SessionDisplayStatus {
	if (row.status === "active" && row.expiresAt.getTime() <= now) {
		return "expired";
	}
	return row.status;
}

/** 只有真正活跃的会话才能被踢下线。 */
export function isRevocable(
	row: Pick<SessionRow, "status" | "expiresAt">,
	now: number,
): boolean {
	return resolveDisplayStatus(row, now) === "active";
}
