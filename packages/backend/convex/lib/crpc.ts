import type {
	ActionCtx,
	MutationCtx,
	QueryCtx,
} from "../functions/generated/server";
import { initCRPC } from "../functions/generated/server";
import { isEnumMember } from "../shared/enum-guard";
import { USER_ROLES, type UserRole } from "../shared/tables/user";
import { error } from "./responses";

const c = initCRPC
	.meta<{
		auth?: "required";
	}>()
	.create();

type IdentityUser = {
	id: string;
	email?: string | null;
	name?: string | null;
	// Guaranteed by `auth.ts`'s `definePayload` — every JWT carries it.
	role: UserRole;
};

function requireAuth<T>(user: T | null): T {
	if (!user) {
		throw error("UNAUTHORIZED", "未登录");
	}

	return user;
}

async function getIdentityUser(
	ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<IdentityUser | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	const rawRole = (identity as { role?: unknown }).role;
	if (!isEnumMember(USER_ROLES, rawRole)) {
		// Should be impossible — defineAuth declares role as required with a
		// default. If we ever see this, something stripped the claim mid-flight.
		throw error("UNAUTHORIZED", "身份令牌缺少角色字段");
	}

	return {
		id: identity.subject,
		email: identity.email,
		name: identity.name,
		role: rawRole,
	};
}

type AllowedRoles = readonly [UserRole, ...UserRole[]];

async function buildAuthCtx(
	ctx: QueryCtx | MutationCtx | ActionCtx,
	allowedRoles: AllowedRoles,
) {
	const user = requireAuth(await getIdentityUser(ctx));
	if (!allowedRoles.includes(user.role)) {
		throw error("FORBIDDEN", "权限不足");
	}
	return { user };
}

export const publicQuery = c.query;
export const publicAction = c.action;
export const publicMutation = c.mutation;

export const privateQuery = c.query.internal();
export const privateMutation = c.mutation.internal();
export const privateAction = c.action.internal();

export const authQuery = {
	requires: (allowedRoles: AllowedRoles) =>
		c.query.meta({ auth: "required" }).use(async ({ ctx, next }) => {
			const auth = await buildAuthCtx(ctx, allowedRoles);
			return next({ ctx: { ...ctx, ...auth } });
		}),
};

export const authMutation = {
	requires: (allowedRoles: AllowedRoles) =>
		c.mutation.meta({ auth: "required" }).use(async ({ ctx, next }) => {
			const auth = await buildAuthCtx(ctx, allowedRoles);
			return next({ ctx: { ...ctx, ...auth } });
		}),
};

export const authAction = {
	requires: (allowedRoles: AllowedRoles) =>
		c.action.meta({ auth: "required" }).use(async ({ ctx, next }) => {
			const auth = await buildAuthCtx(ctx, allowedRoles);
			return next({ ctx: { ...ctx, ...auth } });
		}),
};

export const publicRoute = c.httpAction;
export const authRoute = {
	requires: (allowedRoles: AllowedRoles) =>
		c.httpAction.use(async ({ ctx, next }) => {
			const auth = await buildAuthCtx(ctx, allowedRoles);
			return next({ ctx: { ...ctx, ...auth } });
		}),
};

export const router = c.router;
