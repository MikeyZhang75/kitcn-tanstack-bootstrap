import { eq } from "kitcn/orm";

import { authMutation, authQuery, privateMutation } from "../lib/crpc";
import { endUserSessions } from "../lib/end-user-sessions";
import { resolveUsernames } from "../lib/orm-helpers";
import { hashPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import {
	bootstrapAdminInputSchema,
	getUserInputSchema,
	listUsersInputSchema,
	resetPasswordInputSchema,
} from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import { credentialsTable, userTable } from "./schema";

// How many of each listed user's most recent session rows feed the
// live-session summary. The read is index-backed (`userId`), so this is a real
// cap: a page reads at most `pageSize × this` rows. Users realistically hold a
// handful of sessions, so it only bounds a pathological account — and when it
// bites, the summary under-reports rather than blowing the read limit.
const SESSION_SUMMARY_SCAN_PER_USER = 200;

// Operator-only cold-start. Creates the very first admin from a clean
// deployment with no existing user and no invitation code — the only way to
// break the chicken-and-egg between `signUpWithInvitation` (needs an
// invitation) and `invitations.create` (needs an admin). Refuses to run once
// any admin exists; subsequent admins are promoted manually via the Convex
// dashboard (edit the user row's `role`). Run:
//
//   bunx convex run users:bootstrapAdmin '{"username":"alice","password":"<pw>"}' --prod
//
// After it returns, sign in on the dashboard with that username + password.
export const bootstrapAdmin = privateMutation
	.input(bootstrapAdminInputSchema)
	.mutation(async ({ ctx, input }) => {
		const existingAdmin = await ctx.orm.query.user.findFirst({
			where: { role: "admin" },
			columns: { id: true },
		});
		if (existingAdmin) {
			throw error("CONFLICT", "已存在管理员账户");
		}

		const username = input.username.toLowerCase();
		const existing = await ctx.orm.query.user.findFirst({
			where: { username },
			columns: { id: true },
		});
		if (existing) {
			throw error("CONFLICT", "用户名已被使用");
		}

		const passwordHash = hashPassword(input.password);
		const [user] = await ctx.orm
			.insert(userTable)
			.values({ username, name: input.username, role: "admin" })
			.returning();
		if (!user) {
			throw error("INTERNAL_SERVER_ERROR", "创建用户失败");
		}
		// kitcn surfaces a row's `id` as `string`; FK columns are branded
		// `Id<"user">`. Brand once and reuse (matches the repo convention).
		const userId = user.id as Id<"user">;
		await ctx.orm.insert(credentialsTable).values({ userId, passwordHash });

		return ok({ userId });
	});

// ─── Admin user browser (dashboard /users) ───────────────────────────────────

// Users newest first, offset pagination with the `pageSize + 1` look-ahead —
// same shape as functions/invitations.ts.
//
// The live-session summary is resolved in ONE extra batched query over the
// page's user ids (via the `userId` index), not one query per user. Counting
// with `count()` instead would need an `aggregateIndex` per (userId, status)
// and still couldn't express "active AND not expired", which is a comparison
// against the current time.
export const list = authQuery
	.requires(["admin"])
	.input(listUsersInputSchema)
	.query(async ({ ctx, input }) => {
		const { page, pageSize } = input;

		const rows = await ctx.orm.query.user.findMany({
			orderBy: { createdAt: "desc" },
			offset: page * pageSize,
			limit: pageSize + 1,
			columns: {
				id: true,
				username: true,
				name: true,
				role: true,
				createdAt: true,
			},
		});

		const items = rows.slice(0, pageSize);
		const hasMore = rows.length > pageSize;

		// One INDEX-BACKED query per listed user rather than a single
		// `inArray(userId, ...)` over the whole table.
		//
		// `inArray` compiles to a left-folded `or`, which is a *filter*, not an
		// index range — Convex would scan every session row and only then apply
		// the limit. The session table is append-only (rows are never deleted),
		// so that scan grows without bound. `eq(userId, ...)` uses the `userId`
		// index, and the per-user `limit` is then a genuine read cap.
		//
		// `pageSize` is capped at USER_LIST_PAGE_SIZE_MAX (100), so this is at
		// most 100 small indexed reads for a page.
		const now = Date.now();
		const summaries = await Promise.all(
			items.map(async (user) => {
				const sessions = await ctx.orm.query.session.findMany({
					where: (fields, { eq }) => eq(fields.userId, user.id as Id<"user">),
					// Newest first: with a per-user cap, the recent rows are the ones
					// that can still be active or carry the latest heartbeat.
					orderBy: { createdAt: "desc" },
					columns: { status: true, expiresAt: true, lastSeenAt: true },
					limit: SESSION_SUMMARY_SCAN_PER_USER,
				});

				let activeSessionCount = 0;
				let lastSeenAt: Date | null = null;
				for (const session of sessions) {
					if (
						session.status === "active" &&
						session.expiresAt.getTime() > now
					) {
						activeSessionCount += 1;
					}
					// Newest heartbeat across the user's sessions, ended ones included
					// — "when was this person last actually using the app".
					if (
						session.lastSeenAt &&
						(!lastSeenAt || session.lastSeenAt > lastSeenAt)
					) {
						lastSeenAt = session.lastSeenAt;
					}
				}
				return { activeSessionCount, lastSeenAt };
			}),
		);

		return ok({
			items: items.map((user, index) => ({
				...user,
				activeSessionCount: summaries[index]?.activeSessionCount ?? 0,
				lastSeenAt: summaries[index]?.lastSeenAt ?? null,
			})),
			page,
			pageSize,
			hasMore,
		});
	});

// O(1) total via Convex's native count syscall — unfiltered counts need no
// `aggregateIndex`.
export const count = authQuery.requires(["admin"]).query(async ({ ctx }) => {
	const total = await ctx.orm.query.user.count();
	return ok({ total });
});

// Single user, for the /users/$userId header on a deep link (where the list
// query's page isn't necessarily loaded).
export const get = authQuery
	.requires(["admin"])
	.input(getUserInputSchema)
	.query(async ({ ctx, input }) => {
		const user = await ctx.orm.query.user.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.id),
			columns: {
				id: true,
				username: true,
				name: true,
				role: true,
				createdAt: true,
			},
		});
		if (!user) {
			throw error("NOT_FOUND", "用户不存在");
		}

		// Password-change audit for the detail header. 🔒 The projection lists
		// fields explicitly and deliberately EXCLUDES `passwordHash` — that is the
		// whole reason credentials live in a sibling table. Never widen this to a
		// full-row read or spread the row into the response.
		const credential = await ctx.orm.query.credentials.findFirst({
			where: (fields, { eq }) => eq(fields.userId, user.id as Id<"user">),
			columns: { passwordUpdatedAt: true, passwordUpdatedBy: true },
		});
		const updaterNames = await resolveUsernames(
			ctx,
			credential?.passwordUpdatedBy ? [credential.passwordUpdatedBy] : [],
		);

		return ok({
			user,
			password: {
				updatedAt: credential?.passwordUpdatedAt ?? null,
				updatedBy: credential?.passwordUpdatedBy ?? null,
				updatedByName: credential?.passwordUpdatedBy
					? (updaterNames.get(credential.passwordUpdatedBy) ?? null)
					: null,
			},
		});
	});

// ─── Admin password reset (dashboard /users/$userId) ─────────────────────────

// Force-set another user's password, for a compromised or locked-out account.
// Any role may be targeted, another admin included — see the risk note below.
//
// The admin supplies the new password rather than the server generating one:
// a server-generated plaintext would travel back in the cRPC response and land
// in the TanStack Query cache and devtools.
//
// ⚠️ KNOWN RISK, accepted deliberately: there is no role hierarchy, no
// super-admin, and no protected account (`bootstrapAdmin` refuses to run once
// any admin exists, and further admins are promoted by hand in the Convex
// dashboard). So one compromised admin token escalates to every admin account,
// including the bootstrap one, with no in-app recovery path. The mitigation
// available here is attribution, not prevention: `credentials.passwordUpdatedBy`
// plus the `revokedBy`-stamped session rows record who did it.
export const resetPassword = authMutation
	.requires(["admin"])
	.input(resetPasswordInputSchema)
	.mutation(async ({ ctx, input }) => {
		// Self-target is blocked, and that IS the security boundary: this path
		// deliberately requires no proof of the current password (an admin doesn't
		// have the target's). Allowing it against your own account would turn it
		// into a one-call bypass of `account.changePassword`'s current-password
		// requirement for anyone holding a stolen admin token.
		if (input.userId === ctx.user.id) {
			throw error("BAD_REQUEST", "请通过「修改密码」修改自己的密码");
		}

		const targetId = input.userId as Id<"user">;
		const target = await ctx.orm.query.user.findFirst({
			where: (fields, { eq }) => eq(fields.id, targetId),
			columns: { id: true },
		});
		if (!target) {
			throw error("NOT_FOUND", "用户不存在");
		}

		const passwordHash = hashPassword(input.newPassword);
		const passwordUpdatedAt = new Date();
		const passwordUpdatedBy = ctx.user.id as Id<"user">;

		// Read-then-branch upsert, matching functions/settings.ts. The insert
		// branch is defensive: a user row with no credential can't sign in at all,
		// so repairing it here beats failing the reset.
		const credential = await ctx.orm.query.credentials.findFirst({
			where: (fields, { eq }) => eq(fields.userId, targetId),
			columns: { id: true },
		});
		if (credential) {
			await ctx.orm
				.update(credentialsTable)
				.set({ passwordHash, passwordUpdatedAt, passwordUpdatedBy })
				.where(eq(credentialsTable.id, credential.id));
		} else {
			await ctx.orm.insert(credentialsTable).values({
				userId: targetId,
				passwordHash,
				passwordUpdatedAt,
				passwordUpdatedBy,
			});
		}

		// EVERY session of the target dies, including whatever they have open
		// right now — a reset happens because the account is compromised or the
		// person is gone, and sparing their live tab preserves exactly the access
		// the reset was meant to remove. No `exceptSessionId`: the caller's own
		// session can never be in this set, since self-target is rejected above.
		//
		// The victim's browser leaves on its own — `session.me` is a live
		// subscription, so flipping `status` re-runs it and trips the
		// `_authenticated` gate.
		const revokedSessions = await endUserSessions(ctx, {
			userId: targetId,
			status: "password_changed",
			revokedBy: passwordUpdatedBy,
		});

		return ok({ revokedSessions }, "密码已重置");
	});
