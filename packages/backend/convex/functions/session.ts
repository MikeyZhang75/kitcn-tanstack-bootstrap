import { eq } from "kitcn/orm";

import { authQuery, publicMutation } from "../lib/crpc";
import { verifyPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import { generateSessionToken } from "../lib/session-token";
import { SESSION_TTL_MS, signOutInputSchema } from "../shared/tables/session";
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

		const sessionToken = generateSessionToken();
		await ctx.orm.insert(sessionTable).values({
			token: sessionToken,
			userId,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		});

		return ok({ sessionToken });
	});

// Revoke the current session. Public because it only needs the token itself —
// deleting a non-existent token is a harmless no-op (idempotent sign-out).
export const signOut = publicMutation
	.input(signOutInputSchema)
	.mutation(async ({ ctx, input }) => {
		await ctx.orm
			.delete(sessionTable)
			.where(eq(sessionTable.token, input.sessionToken));
		return ok("已退出登录");
	});

// Current identity for the route gate + sidebar user menu. Allowed for any
// role; the per-app gate compares the returned `role` against what the app
// accepts. This is the only place the frontend asks the backend "who am I".
export const me = authQuery.requires(USER_ROLES).query(async ({ ctx }) => {
	return ok({ user: ctx.user });
});
