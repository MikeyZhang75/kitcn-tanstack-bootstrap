import { eq } from "kitcn/orm";

import type { Id } from "../functions/_generated/dataModel";
import type { MutationCtx } from "../functions/generated/server";
import { sessionTable } from "../functions/schema";
import {
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
 * rather than implying the account is fully drained in one call.
 *
 * {@link SESSION_REVOKE_BATCH_MAX} is a genuine BATCH SIZE: the window is "the N
 * newest rows whose status is still `active`", so everything this call ends
 * leaves the window, and calling again picks up the next N. An account with more
 * live sessions than N drains over repeated calls.
 *
 * That only holds because of the `("userId", "status")` compound index — an
 * earlier version filtered `userId` alone and sorted the status out in memory,
 * which made N a hard ceiling: the second call re-read the same N now-terminal
 * rows and ended zero, leaving any older live session permanently unreachable by
 * every path that shares this helper. Someone holding the password could reach
 * that state deliberately with N+1 `session.signIn` calls.
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
		// Both equalities are pushed into the index range (kitcn walks the index's
		// fields in order and consumes an `eq` for each), so `limit` below is a
		// real read bound rather than a slice applied after a wider scan. Keep the
		// clause order matching the index's field order.
		where: (fields, { and, eq }) =>
			and(eq(fields.userId, opts.userId), eq(fields.status, "active")),
		// `orderBy` is load-bearing, not cosmetic — though for a subtler reason
		// than it looks. The default order is `_creationTime` ASCENDING, so a bare
		// `limit` would take this user's OLDEST still-`active` rows. Those are
		// exactly the expired ones: `expiresAt` is `createdAt + SESSION_TTL_MS`
		// with a constant TTL, so "expired" is equivalent to "older", and expiry
		// is never materialised into `status`. The filter below then drops every
		// one of them and this would end nothing while reporting success.
		// Descending puts every live row ahead of every expired one.
		//
		// ⚠️ That equivalence is what a per-session TTL would break. If
		// `SESSION_TTL_MS` ever stops being a constant, this needs revisiting.
		orderBy: { createdAt: "desc" },
		columns: { id: true, expiresAt: true },
		limit: SESSION_REVOKE_BATCH_MAX,
	});

	const now = Date.now();
	const targets = sessions.filter(
		(session) =>
			// Skip already-lapsed rows: they're dead, and stamping `revokedBy` on
			// them would claim someone ended what expired on its own.
			session.expiresAt.getTime() > now && session.id !== opts.exceptSessionId,
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
