import { z } from "zod";

import type { invitationsTable } from "../../functions/schema";

// ─── Invitation code constraints ───────────────────────────────────────────
// The shape a code must have to be accepted at signup (end-user types it in)
// and to be stored on a row. Codes are *never* authored by a human anymore —
// `invitations.create` always generates them — but the validator stays because
// signup still parses whatever the visitor typed. The pattern remains wider
// than the generator's alphabet (`_` and `-` are allowed) so historical
// hand-minted codes like `launch-001` keep validating.

export const INVITATION_CODE_MIN_LENGTH = 4;
export const INVITATION_CODE_MAX_LENGTH = 64;
export const INVITATION_CODE_PATTERN = "[A-Za-z0-9_-]+";

// ─── Generated code shape ──────────────────────────────────────────────────
// Length lives here rather than next to the generator so the dashboard copy
// ("自动生成 12 位…") and the backend stay in sync. The alphabet itself is a
// backend-only concern and stays in `functions/invitations.ts`.

export const GENERATED_INVITATION_CODE_LENGTH = 12;

// ─── Status enum ───────────────────────────────────────────────────────────
// `active` — 未使用，可被 signup 消耗或 admin 撤销。
// `used`   — signup 已消耗；留着作审计轨迹，不能再撤销。
// `revoked`— admin 主动撤销，保留以便查“谁什么时候撤的”。
// 软删除策略：撤销后行不删，但 code 的 unique 约束仍在。若以后要复用已撤
// 销的 code，需改成 partial unique（例如基于 `(code, status = 'active')`）。

export const INVITATION_STATUSES = ["active", "used", "revoked"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const DEFAULT_INVITATION_STATUS: InvitationStatus = "active";

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
	active: "可使用",
	used: "已使用",
	revoked: "已撤销",
};

export const invitationCodeInputSchema = z
	.string()
	.trim()
	.min(
		INVITATION_CODE_MIN_LENGTH,
		`邀请码至少 ${INVITATION_CODE_MIN_LENGTH} 位`,
	)
	.max(
		INVITATION_CODE_MAX_LENGTH,
		`邀请码最多 ${INVITATION_CODE_MAX_LENGTH} 位`,
	)
	.regex(
		new RegExp(`^${INVITATION_CODE_PATTERN}$`),
		"邀请码只能包含字母、数字、下划线或连字符",
	);

// ─── Row schema ────────────────────────────────────────────────────────────
// Canonical shape of an invitations row. All of `usedAt` / `usedBy` /
// `createdBy` are nullable at the table level — null on newly minted rows,
// filled in by `signUpWithInvitation` / `create` respectively.

export const invitationSchema = z.object({
	code: invitationCodeInputSchema,
	status: z.enum(INVITATION_STATUSES),
	usedAt: z.date().optional(),
	usedBy: z.string().optional(),
	createdBy: z.string().optional(),
});

// ─── Procedure input schemas ───────────────────────────────────────────────

// Upper bound on `pageSize` for the list query. Backend uses offset pagination
// — kitcn emulates offset by reading (offset + limit) rows and discarding the
// prefix, so deeper pages do more server-side work but client-facing round-
// trip stays constant.
export const INVITATION_LIST_PAGE_SIZE_MAX = 100;

export const listInputSchema = z.object({
	page: z.number().int().nonnegative(),
	pageSize: z.number().int().min(1).max(INVITATION_LIST_PAGE_SIZE_MAX),
});

// ─── Batch creation constraints ────────────────────────────────────────────
// Admins mint codes by count only — the code value itself is always generated
// server-side, so there is no `code` input. The upper bound keeps a single
// create call inside one Convex mutation's budget: each code costs one
// uniqueness probe plus one insert, and 100 of those is comfortably under the
// per-transaction read/write limits.

export const INVITATION_CREATE_COUNT_MIN = 1;
export const INVITATION_CREATE_COUNT_MAX = 100;
export const DEFAULT_INVITATION_CREATE_COUNT = 1;

export const invitationCreateCountSchema = z
	.number("请输入创建数量")
	.int("创建数量必须是整数")
	.min(
		INVITATION_CREATE_COUNT_MIN,
		`创建数量至少 ${INVITATION_CREATE_COUNT_MIN} 个`,
	)
	.max(
		INVITATION_CREATE_COUNT_MAX,
		`创建数量最多 ${INVITATION_CREATE_COUNT_MAX} 个`,
	);

export const createInvitationInputSchema = z.object({
	count: invitationCreateCountSchema,
});

export const revokeInvitationInputSchema = z.object({
	id: z.string().min(1),
});

// ─── Drift check ───────────────────────────────────────────────────────────

type SameKeys<A, B> = [A, B] extends [B, A] ? true : never;
export const _invitationSchemaDriftOk: SameKeys<
	keyof typeof invitationsTable.$inferInsert,
	keyof z.infer<typeof invitationSchema>
> = true;
