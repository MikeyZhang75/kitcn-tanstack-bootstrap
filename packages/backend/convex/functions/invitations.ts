import { eq } from "kitcn/orm";

import { authMutation, authQuery } from "../lib/crpc";
import { chunkedInArray } from "../lib/orm-helpers";
import { error, ok } from "../lib/responses";
import {
	createInvitationInputSchema,
	DEFAULT_INVITATION_STATUS,
	listInputSchema,
	revokeInvitationInputSchema,
} from "../shared/tables/invitations";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./generated/server";
import { invitationsTable } from "./schema";

async function resolveUsernames(
	ctx: Pick<QueryCtx, "orm">,
	ids: string[],
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (ids.length === 0) return result;
	const users = await chunkedInArray(ids, (batch) =>
		ctx.orm.query.user.findMany({
			where: (fields, { inArray }) => inArray(fields.id, batch),
			columns: { id: true, username: true },
			limit: batch.length,
		}),
	);
	for (const user of users) {
		// `username` is the canonical handle (lowercased, set by the Better
		// Auth username plugin on every signup). Users without it are legacy
		// pre-plugin rows and won't appear in the output map.
		if (user.username) {
			result.set(user.id, user.username);
		}
	}
	return result;
}

// Page-number pagination via offset on the system `createdAt` (`_creationTime`)
// order — newest first. No secondary index required. `limit: pageSize + 1` is
// the standard look-ahead trick for `hasMore`; user-resolution only runs on
// the `pageSize` rows we actually return.
export const list = authQuery
	.requires(["admin"])
	.input(listInputSchema)
	.query(async ({ ctx, input }) => {
		const { page, pageSize } = input;

		const rows = await ctx.orm.query.invitations.findMany({
			orderBy: { createdAt: "desc" },
			offset: page * pageSize,
			limit: pageSize + 1,
			columns: {
				id: true,
				code: true,
				status: true,
				usedAt: true,
				usedBy: true,
				createdBy: true,
				createdAt: true,
			},
		});

		const items = rows.slice(0, pageSize);
		const hasMore = rows.length > pageSize;

		// Resolve both `createdBy` (admin) and `usedBy` (consumer) ids to
		// usernames in one batched user-table lookup. Ids that don't resolve
		// (e.g. a user deleted after the invitation row was written) land as
		// null and the frontend falls through to a raw id / em-dash.
		const userIds = Array.from(
			new Set(
				items.flatMap((row) => [
					...(row.createdBy ? [row.createdBy] : []),
					...(row.usedBy ? [row.usedBy] : []),
				]),
			),
		);
		const usernames = await resolveUsernames(ctx, userIds);

		return ok({
			items: items.map((row) => ({
				...row,
				createdByName: row.createdBy
					? (usernames.get(row.createdBy) ?? null)
					: null,
				usedByName: row.usedBy ? (usernames.get(row.usedBy) ?? null) : null,
			})),
			page,
			pageSize,
			hasMore,
		});
	});

// O(1) total count via Convex's native count syscall (unfiltered counts
// don't require an `aggregateIndex`). Used by the list page to render
// "共 N 条" and derive total page count.
export const count = authQuery.requires(["admin"]).query(async ({ ctx }) => {
	const total = await ctx.orm.query.invitations.count();
	return ok({ total });
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GENERATED_CODE_LENGTH = 12;
const MAX_GENERATION_ATTEMPTS = 10;

// `Math.random()` is V8's non-cryptographic PRNG — its state can be
// reconstructed from a handful of observed outputs, which lets an attacker
// predict future invitation codes (the sole signup gate). Use Web Crypto
// (available in the Convex V8 runtime) with rejection sampling so the
// distribution stays uniform across CODE_ALPHABET. 256 % 32 === 0 today,
// so the threshold never rejects, but the guard keeps the function correct
// if the alphabet length is ever changed.
function generateRandomCode(): string {
	const threshold = 256 - (256 % CODE_ALPHABET.length);
	const buffer = new Uint8Array(GENERATED_CODE_LENGTH);
	let code = "";
	while (code.length < GENERATED_CODE_LENGTH) {
		crypto.getRandomValues(buffer);
		for (const byte of buffer) {
			if (byte >= threshold) continue;
			code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
			if (code.length === GENERATED_CODE_LENGTH) break;
		}
	}
	return code;
}

// Mint a new invitation. If the admin supplied a code we use it verbatim;
// otherwise we generate a short alphanumeric string (excluding ambiguous
// characters like 0/O, 1/I/L) and retry on unique-constraint collision.
export const create = authMutation
	.requires(["admin"])
	.input(createInvitationInputSchema)
	.mutation(async ({ ctx, input }) => {
		// `ctx.user.id` is typed as `string` on `IdentityUser` but at runtime
		// is always the caller's `user` table `_id`. Narrow to `Id<"user">`
		// so kitcn's branded `createdBy` column accepts it without a nested
		// cast on every insert call site.
		const createdBy = ctx.user.id as Id<"user">;

		if (input.code) {
			const existing = await ctx.orm.query.invitations.findFirst({
				where: { code: input.code },
				columns: { id: true },
			});
			if (existing) {
				throw error("CONFLICT", "邀请码已存在");
			}
			const [row] = await ctx.orm
				.insert(invitationsTable)
				.values({
					code: input.code,
					status: DEFAULT_INVITATION_STATUS,
					createdBy,
				})
				.returning();
			if (!row) {
				throw error("INTERNAL_SERVER_ERROR", "邀请码创建失败");
			}
			return ok({ id: row.id, code: input.code });
		}

		// Generation retry loop — collisions are astronomically unlikely at
		// 12 × 32-base but we guard against them rather than crashing.
		for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
			const code = generateRandomCode();
			const existing = await ctx.orm.query.invitations.findFirst({
				where: { code },
				columns: { id: true },
			});
			if (existing) continue;
			const [row] = await ctx.orm
				.insert(invitationsTable)
				.values({ code, status: DEFAULT_INVITATION_STATUS, createdBy })
				.returning();
			if (!row) {
				throw error("INTERNAL_SERVER_ERROR", "邀请码创建失败");
			}
			return ok({ id: row.id, code });
		}
		throw error("INTERNAL_SERVER_ERROR", "邀请码生成失败，请重试");
	});

// Soft-revoke an active invitation by transitioning `status` to `revoked`.
// Hard-delete was tempting but left no audit trail for "who revoked what,
// when". `used` rows stay untouchable so the signup-history reference is
// preserved.
export const revoke = authMutation
	.requires(["admin"])
	.input(revokeInvitationInputSchema)
	.mutation(async ({ ctx, input }) => {
		const invitation = await ctx.orm.query.invitations.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.id),
			columns: { id: true, status: true },
		});
		if (!invitation) {
			throw error("NOT_FOUND", "邀请码不存在");
		}
		if (invitation.status !== "active") {
			throw error(
				"BAD_REQUEST",
				invitation.status === "used"
					? "邀请码已被使用，无法撤销"
					: "邀请码已撤销",
			);
		}

		await ctx.orm
			.update(invitationsTable)
			.set({ status: "revoked" })
			.where(eq(invitationsTable.id, invitation.id));

		return ok("邀请码已撤销");
	});
