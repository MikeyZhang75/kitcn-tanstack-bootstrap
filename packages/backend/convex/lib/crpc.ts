import { z } from "zod";

import type { MutationCtx, QueryCtx } from "../functions/generated/server";
import { initCRPC } from "../functions/generated/server";
import { sessionTokenSchema } from "../shared/tables/session";
import { type UserRole } from "../shared/tables/user";
import { error } from "./responses";

const c = initCRPC.create();

// Identity resolved from a session token — replaces the old JWT-derived
// `ctx.auth.getUserIdentity()` shape. There is no `ctx.userId`; use
// `ctx.user.id`.
export type IdentityUser = {
	id: string;
	username: string;
	name: string;
	role: UserRole;
};

type AllowedRoles = readonly [UserRole, ...UserRole[]];

// Every authenticated procedure carries the bearer token in its input. Convex
// validates procedure args strictly, so the token must be a declared field —
// the auth builders merge this into the procedure's input via a stacked
// `.input(...)` before the caller adds the procedure's own schema.
const sessionInputSchema = z.object({
	sessionToken: sessionTokenSchema,
});

// The sole authorization path: look the token up in the `session` table,
// reject if missing/expired, load the user, and enforce the allowed roles.
// All reads — no `ctx.auth`, no JWT. `Date.now()` is execution-stable in the
// Convex runtime, so the expiry check is deterministic.
async function resolveSessionUser(
	ctx: QueryCtx | MutationCtx,
	sessionToken: string,
	allowedRoles: AllowedRoles,
): Promise<IdentityUser> {
	const session = await ctx.orm.query.session.findFirst({
		where: { token: sessionToken },
		columns: { id: true, userId: true, expiresAt: true },
	});
	if (!session) {
		throw error("UNAUTHORIZED", "未登录");
	}
	if (session.expiresAt.getTime() <= Date.now()) {
		throw error("UNAUTHORIZED", "会话已过期，请重新登录");
	}

	const user = await ctx.orm.query.user.findFirst({
		where: (fields, { eq }) => eq(fields.id, session.userId),
		columns: { id: true, username: true, name: true, role: true },
	});
	if (!user) {
		throw error("UNAUTHORIZED", "用户不存在");
	}
	if (!allowedRoles.includes(user.role)) {
		throw error("FORBIDDEN", "权限不足");
	}

	return {
		id: user.id,
		username: user.username,
		name: user.name,
		role: user.role,
	};
}

export const publicQuery = c.query;
export const publicAction = c.action;
export const publicMutation = c.mutation;

export const privateQuery = c.query.internal();
export const privateMutation = c.mutation.internal();
export const privateAction = c.action.internal();

// HTTP variant — public only. Authenticated HTTP/action procedures aren't
// supported in the session-token model (a query/mutation reads the token from
// its input; an HTTP route would have to parse it from the Authorization
// header and resolve the session via an internal caller). Nothing needs that
// today; add it deliberately if a webhook ever does.
export const publicRoute = c.httpAction;

export const authQuery = {
	requires: (allowedRoles: AllowedRoles) =>
		c.query.input(sessionInputSchema).use(async ({ ctx, input, next }) => {
			const user = await resolveSessionUser(
				ctx,
				input.sessionToken,
				allowedRoles,
			);
			return next({ ctx: { ...ctx, user } });
		}),
};

export const authMutation = {
	requires: (allowedRoles: AllowedRoles) =>
		c.mutation.input(sessionInputSchema).use(async ({ ctx, input, next }) => {
			const user = await resolveSessionUser(
				ctx,
				input.sessionToken,
				allowedRoles,
			);
			return next({ ctx: { ...ctx, user } });
		}),
};

export const router = c.router;
