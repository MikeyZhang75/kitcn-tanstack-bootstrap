import type { UserRole } from "@repo/backend/shared/tables/user";

export type UserRow = {
	id: string;
	username: string;
	name: string;
	role: UserRole;
	/** `status === "active"` 且未过期的会话数 */
	activeSessionCount: number;
	/** 该用户所有会话里最新的心跳时间；从未心跳过为 null */
	lastSeenAt: Date | null;
	createdAt: Date;
};
