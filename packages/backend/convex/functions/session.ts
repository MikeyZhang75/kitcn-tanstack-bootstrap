import { eq } from "kitcn/orm";

import { createSession } from "../lib/create-session";
import { authMutation, authQuery, publicMutation } from "../lib/crpc";
import { endUserSessions } from "../lib/end-user-sessions";
import { resolveUsernames } from "../lib/orm-helpers";
import { verifyPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import {
	countUserSessionsInputSchema,
	DEFAULT_SESSION_STATUS,
	LAST_SEEN_THROTTLE_MS,
	listUserSessionsInputSchema,
	revokeSessionInputSchema,
	revokeUserSessionsInputSchema,
	SESSION_ALREADY_ENDED_MESSAGES,
	SESSION_COUNT_SCAN_MAX,
	signOutInputSchema,
} from "../shared/tables/session";
import { signInInputSchema, USER_ROLES } from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import { sessionTable } from "./schema";

// Establish a session from username + password. Returns the opaque session
// token; the client stores it in localStorage and sends it on every
// authenticated call. Failure is a single generic message — username
// enumeration is already possible via signup's "用户名已被使用", so we don't
// add a second oracle here, but we also don't leak whether the username or the
// password was wrong.
export const signIn = publicMutation
	.input(signInInputSchema)
	.mutation(async ({ ctx, input }) => {
		const username = input.username.toLowerCase();

		const user = await ctx.orm.query.user.findFirst({
			where: { username },
			columns: { id: true },
		});
		if (!user) {
			throw error("UNAUTHORIZED", "用户名或密码错误");
		}
		// kitcn surfaces a row's `id` as `string`; FK columns are branded
		// `Id<"user">`. Brand once and reuse (matches the repo convention).
		const userId = user.id as Id<"user">;

		const credential = await ctx.orm.query.credentials.findFirst({
			where: (fields, { eq }) => eq(fields.userId, userId),
			columns: { passwordHash: true },
		});
		if (
			!credential ||
			!verifyPassword(input.password, credential.passwordHash)
		) {
			throw error("UNAUTHORIZED", "用户名或密码错误");
		}

		// Mints the session row, stamped with the request's IP / User-Agent.
		const sessionToken = await createSession(ctx, userId);

		return ok({ sessionToken });
	});

// End the current session. Public because it only needs the token itself.
//
// This is an UPDATE, not a delete: the row survives as the audit record of that
// login. Only `active` rows transition, which keeps sign-out idempotent and
// stops a late sign-out from overwriting an admin's `revoked` record with
// `signed_out`. An unknown token is a silent no-op.
export const signOut = publicMutation
	.input(signOutInputSchema)
	.mutation(async ({ ctx, input }) => {
		const session = await ctx.orm.query.session.findFirst({
			where: { token: input.sessionToken },
			columns: { id: true, status: true },
		});
		if (session && (session.status ?? DEFAULT_SESSION_STATUS) === "active") {
			await ctx.orm
				.update(sessionTable)
				.set({ status: "signed_out", endedAt: new Date() })
				.where(eq(sessionTable.id, session.id));
		}
		return ok("已退出登录");
	});

// Liveness ping. The ONLY writer of `lastSeenAt` — Convex queries can't write,
// and this app's authenticated traffic is almost entirely queries, so there is
// no way to piggyback liveness on ordinary requests. The client fires this on
// an interval (see packages/app-convex/src/use-heartbeat.ts).
//
// The throttle matters: every open tab runs its own timer, and without it N
// tabs would write the same row on every tick and contend under Convex's OCC.
// `ctx.session` comes from the auth middleware's existing lookup, so the
// skipped path costs no extra read and no write at all.
export const heartbeat = authMutation
	.requires(USER_ROLES)
	.mutation(async ({ ctx }) => {
		const now = Date.now();
		const lastSeenAt = ctx.session.lastSeenAt;
		if (lastSeenAt && now - lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS) {
			return ok("ok");
		}
		await ctx.orm
			.update(sessionTable)
			.set({ lastSeenAt: new Date(now) })
			.where(eq(sessionTable.id, ctx.session.id));
		return ok("ok");
	});

// Current identity for the route gate + sidebar user menu. Allowed for any
// role; the per-app gate compares the returned `role` against what the app
// accepts. This is the only place the frontend asks the backend "who am I".
export const me = authQuery.requires(USER_ROLES).query(async ({ ctx }) => {
	return ok({ user: ctx.user });
});

// ─── Admin session browser (dashboard /users/$userId) ────────────────────────

// One user's sessions, newest first, via the `userId` index. Offset pagination
// with the `pageSize + 1` look-ahead for `hasMore`, matching
// functions/invitations.ts.
//
// 🔒 `token` is deliberately absent from the projection. It is the bearer
// credential: returning it here would let anyone with dashboard access
// impersonate any signed-in user. Never add it back.
//
// No status filter — ended and expired rows are exactly what an audit view
// wants. The frontend derives 活跃 / 已过期 / 已退出 / 已终止 from `status`
// plus `expiresAt`.
export const listByUser = authQuery
	.requires(["admin"])
	.input(listUserSessionsInputSchema)
	.query(async ({ ctx, input }) => {
		const { userId, page, pageSize } = input;

		const rows = await ctx.orm.query.session.findMany({
			where: (fields, { eq }) => eq(fields.userId, userId as Id<"user">),
			orderBy: { createdAt: "desc" },
			offset: page * pageSize,
			limit: pageSize + 1,
			columns: {
				id: true,
				userId: true,
				status: true,
				expiresAt: true,
				lastSeenAt: true,
				endedAt: true,
				revokedBy: true,
				ipAddress: true,
				userAgent: true,
				createdAt: true,
			},
		});

		const items = rows.slice(0, pageSize);
		const hasMore = rows.length > pageSize;

		// Resolve the revoking admins' usernames so the audit column reads as a
		// name rather than a raw id. One batched lookup for the page.
		const revokerNames = await resolveUsernames(
			ctx,
			Array.from(
				new Set(items.flatMap((row) => (row.revokedBy ? [row.revokedBy] : []))),
			),
		);

		return ok({
			items: items.map((row) => ({
				...row,
				status: row.status ?? DEFAULT_SESSION_STATUS,
				revokedByName: row.revokedBy
					? (revokerNames.get(row.revokedBy) ?? null)
					: null,
				// Lets the UI mark "this is the session you're using right now", so
				// an admin browsing their own account doesn't kick themselves by
				// accident. Derived from `ctx.session.id`, never from the token —
				// the token itself must not leave the backend.
				isCurrent: row.id === ctx.session.id,
			})),
			page,
			pageSize,
			hasMore,
		});
	});

// Total sessions for one user, for the list pager.
//
// This is a bounded id scan, NOT `count()`: kitcn's `count({ where })` only
// accepts an `AggregateNoScanWhereArg`, i.e. it requires declaring an
// `aggregateIndex` on the table. That was deliberately avoided here — the
// aggregate would have to be maintained on every session write, and `heartbeat`
// makes writes to this table the hottest path in the app.
//
// The scan is capped at SESSION_COUNT_SCAN_MAX; `capped` tells the UI to render
// "N+" rather than silently under-reporting. A real user holds a handful of
// sessions, so the cap only bounds a pathological account.
export const countByUser = authQuery
	.requires(["admin"])
	.input(countUserSessionsInputSchema)
	.query(async ({ ctx, input }) => {
		// Read one past the cap so "exactly at the cap" isn't misreported as
		// "more than the cap" — the same look-ahead trick the list procedures use.
		const rows = await ctx.orm.query.session.findMany({
			where: (fields, { eq }) => eq(fields.userId, input.userId as Id<"user">),
			columns: { id: true },
			limit: SESSION_COUNT_SCAN_MAX + 1,
		});
		const capped = rows.length > SESSION_COUNT_SCAN_MAX;
		return ok({
			total: capped ? SESSION_COUNT_SCAN_MAX : rows.length,
			capped,
		});
	});

// ─── Revocation (踢下线) ─────────────────────────────────────────────────────

// Kick a single session. Soft transition like sign-out, but stamped with the
// acting admin so the audit trail distinguishes "user left" from "admin kicked".
// The victim's browser bounces on its own: `session.me` is a live subscription,
// so flipping `status` makes it re-run, throw UNAUTHORIZED, and trip the
// `_authenticated` gate.
export const revoke = authMutation
	.requires(["admin"])
	.input(revokeSessionInputSchema)
	.mutation(async ({ ctx, input }) => {
		const session = await ctx.orm.query.session.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.id),
			columns: { id: true, status: true, expiresAt: true },
		});
		if (!session) {
			throw error("NOT_FOUND", "会话不存在");
		}
		const status = session.status ?? DEFAULT_SESSION_STATUS;
		if (status !== "active") {
			// Exhaustive map rather than a ternary: a status added later would
			// otherwise be silently mislabeled 已终止 with no compile error.
			throw error("BAD_REQUEST", SESSION_ALREADY_ENDED_MESSAGES[status]);
		}
		// An already-lapsed session is dead anyway, and stamping `revokedBy` on it
		// would claim an admin ended something that expired on its own. Matches
		// the UI, where `isRevocable` disables the button for expired rows.
		if (session.expiresAt.getTime() <= Date.now()) {
			throw error("BAD_REQUEST", "该会话已过期");
		}

		await ctx.orm
			.update(sessionTable)
			.set({
				status: "revoked",
				endedAt: new Date(),
				revokedBy: ctx.user.id as Id<"user">,
			})
			.where(eq(sessionTable.id, session.id));

		return ok("会话已终止");
	});

// Kick every active session of one user.
//
// The caller's own current session is ALWAYS excluded: an admin using this on
// their own account means "sign out my other devices", not "lock me out". When
// the target is somebody else the exclusion never matches, so it costs nothing.
//
// The loop itself (the load-bearing `orderBy`, the skip-expired guard, the
// batch cap) lives in lib/end-user-sessions.ts, shared with the two password
// procedures. The response reports how many were actually ended rather than
// implying the account is fully drained.
export const revokeAllForUser = authMutation
	.requires(["admin"])
	.input(revokeUserSessionsInputSchema)
	.mutation(async ({ ctx, input }) => {
		const revoked = await endUserSessions(ctx, {
			userId: input.userId as Id<"user">,
			status: "revoked",
			exceptSessionId: ctx.session.id,
			revokedBy: ctx.user.id as Id<"user">,
		});

		return ok({ revoked });
	});
