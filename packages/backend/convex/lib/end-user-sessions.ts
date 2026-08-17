import { eq } from "kitcn/orm";

import type { Id } from "../functions/_generated/dataModel";
import type { MutationCtx } from "../functions/generated/server";
import { sessionTable } from "../functions/schema";
import {
	DEFAULT_SESSION_STATUS,
	type EndedSessionStatus,
	SESSION_REVOKE_BATCH_MAX,
} from "../shared/tables/session";

/**
 * The single way a batch of a user's sessions is terminated. Three procedures
 * need it — `session.revokeAllForUser` (踢下线), `account.changePassword`, and
 * `users.resetPassword` — and the loop is full of non-obvious invariants, so it
 * lives here rather than being copied three times and drifting.
 *
 * Returns how many sessions were actually ended. Callers report that number
 * rather than implying the account is fully drained.
 *
 * ⚠️ {@link SESSION_REVOKE_BATCH_MAX} is a HARD CEILING, not a batch size —
 * calling again does NOT reach further. The read is
 * `withIndex("userId").order("desc").take(N)` with no `status` filter, so a
 * second call re-reads the same N newest rows (now terminal) and ends zero. An
 * account holding more than N sessions newer than a given active one can never
 * have that one terminated, by this or any other path (`revokeAllForUser` shares
 * this helper). Reaching that state takes N+1 deliberate `session.signIn` calls.
 *
 * The fix is a compound `("userId", "status")` index plus an
 * `eq(fields.status, "active")` clause, which turns the window into "the N
 * newest *terminable* rows" and genuinely drains. It is blocked until
 * `session.status` is hardened to `.notNull()`: the column is still nullable,
 * null means active (hence the `??` below), and an indexed equality on
 * `"active"` would silently skip those rows. See docs/feature-session-audit.md
 * 「Known limitations」.
 *
 * @param opts.status           terminal status to write (`revoked`,
 *                              `password_changed`, …).
 * @param opts.exceptSessionId  a session to spare — pass `ctx.session.id` for
 *                              "sign out my other devices" semantics.
 * @param opts.revokedBy        the admin who drove it. Omit entirely for a
 *                              self-service action: the column means "an admin
 *                              kicked this", and writing it also costs an extra
 *                              `db.get` per row (kitcn only enforces a foreign
 *                              key when its column is in the write set).
 */
export async function endUserSessions(
	ctx: MutationCtx,
	opts: {
		userId: Id<"user">;
		status: EndedSessionStatus;
		exceptSessionId?: string;
		revokedBy?: Id<"user">;
	},
): Promise<number> {
	const sessions = await ctx.orm.query.session.findMany({
		where: (fields, { eq }) => eq(fields.userId, opts.userId),
		// `orderBy` is load-bearing, not cosmetic: the default order is
		// `_creationTime` ASCENDING, so a bare `limit` would take the user's
		// OLDEST rows. Since rows are never deleted, a long-lived account
		// accumulates ended sessions and the live ones — always the newest —
		// would fall outside the window, making this silently end nothing while
		// reporting success.
		orderBy: { createdAt: "desc" },
		columns: { id: true, status: true, expiresAt: true },
		limit: SESSION_REVOKE_BATCH_MAX,
	});

	const now = Date.now();
	const targets = sessions.filter(
		(session) =>
			// TODO(migration): the `??` tolerates rows written before `status`
			// existed; drop it once the column is hardened to `.notNull()`.
			(session.status ?? DEFAULT_SESSION_STATUS) === "active" &&
			// Skip already-lapsed rows: they're dead, and stamping `revokedBy` on
			// them would claim someone ended what expired on its own.
			session.expiresAt.getTime() > now &&
			session.id !== opts.exceptSessionId,
	);

	const endedAt = new Date();
	for (const session of targets) {
		await ctx.orm
			.update(sessionTable)
			.set({
				status: opts.status,
				endedAt,
				...(opts.revokedBy ? { revokedBy: opts.revokedBy } : {}),
			})
			.where(eq(sessionTable.id, session.id));
	}

	return targets.length;
}
