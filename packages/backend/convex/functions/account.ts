import { eq } from "kitcn/orm";

import { createSession } from "../lib/create-session";
import { authMutation } from "../lib/crpc";
import { endUserSessions } from "../lib/end-user-sessions";
import { hashPassword, verifyPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import { changePasswordInputSchema, USER_ROLES } from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import { credentialsTable, sessionTable } from "./schema";

// Self-service account management. Kept out of functions/users.ts on purpose:
// every export there is `requires(["admin"])`, and a `USER_ROLES` procedure
// sitting among them is one copy-paste away from losing its role narrowing.

// Change your own password.
//
// The current password is REQUIRED, and that is specific to this auth model
// rather than generic hygiene: the session token is a bearer credential sitting
// in localStorage for an absolute 30 days, there is no re-authentication or
// auth-recency signal anywhere, and there is no email, reset flow, or second
// factor to recover with. Without the proof, mere possession of a lifted token
// would convert into permanent ownership of the account.
//
// The target is always `ctx.user.id` from the middleware and never an input
// field — an input-supplied target on a `requires(USER_ROLES)` procedure would
// let any user rewrite any other user's password.
export const changePassword = authMutation
	.requires(USER_ROLES)
	.input(changePasswordInputSchema)
	.mutation(async ({ ctx, input }) => {
		const userId = ctx.user.id as Id<"user">;

		// Index-backed via `credentials_userId_unique` (the `.unique()` on the
		// column materialises a real Convex index). Explicit projection: the hash
		// is read into a local and never reaches the response.
		const credential = await ctx.orm.query.credentials.findFirst({
			where: (fields, { eq }) => eq(fields.userId, userId),
			columns: { id: true, passwordHash: true },
		});
		if (!credential) {
			throw error("INTERNAL_SERVER_ERROR", "凭据不存在");
		}

		// Verify BEFORE hashing so a wrong guess costs one scrypt run, not two.
		if (!verifyPassword(input.currentPassword, credential.passwordHash)) {
			// BAD_REQUEST, not UNAUTHORIZED: the latter is reserved by
			// `resolveSession` for a dead session, and the frontend reads it that
			// way. Here the session is valid and the input is wrong. Naming the
			// wrong field leaks nothing — the caller is already authenticated as
			// this exact account, so `signIn`'s deliberately vague message (which
			// exists to avoid handing an anonymous caller a username oracle) has no
			// analogue here.
			throw error("BAD_REQUEST", "当前密码错误");
		}

		// Plaintext comparison is exact here precisely because the check above
		// already proved `currentPassword` is the stored one — no need to spend a
		// third scrypt run re-verifying `newPassword` against the old hash.
		if (input.newPassword === input.currentPassword) {
			throw error("BAD_REQUEST", "新密码不能与当前密码相同");
		}

		const passwordHash = hashPassword(input.newPassword);
		await ctx.orm
			.update(credentialsTable)
			.set({
				passwordHash,
				passwordUpdatedAt: new Date(),
				passwordUpdatedBy: userId,
			})
			.where(eq(credentialsTable.id, credential.id));

		// Ending the old sessions is mandatory, not a nicety: `resolveSession`
		// never consults `credentials`, and there is no password version or token
		// derivation linking the two — so without this a stolen token keeps
		// authorizing every call for the rest of its 30-day TTL, which makes
		// changing the password (exactly what someone does when they suspect
		// compromise) do nothing at all.
		//
		// Deliberately last: it establishes the OCC read set over the hot
		// `session` table, and a conflict retry re-runs the whole mutation
		// including both scrypt hashes. Keeping the read adjacent to the commit
		// keeps that window as small as possible.
		//
		// No `revokedBy`: no admin was involved, and writing the column would cost
		// an extra foreign-key read per row.
		//
		// The count excludes the caller's own session so the UI can say "其他 N 个
		// 设备"; that session is ended separately below.
		const revokedSessions = await endUserSessions(ctx, {
			userId,
			status: "password_changed",
			exceptSessionId: ctx.session.id,
		});

		// ⚠️ The caller's OWN session is ended too, and its replacement gets a
		// brand-new token. Sparing the row would spare the single most valuable
		// credential in the system: the token string sitting in this very
		// browser's localStorage — i.e. exactly what an XSS payload or someone
		// with a minute at an unlocked machine walks away with. That copy
		// authenticates as this session forever, and "I changed my password"
		// would not touch it.
		//
		// This still means 「当前设备保持登录」: the device stays signed in, just on
		// a fresh credential. The client swaps the stored token and does a
		// full-page navigation, the same resync the sign-in path uses.
		await ctx.orm
			.update(sessionTable)
			.set({ status: "password_changed", endedAt: new Date() })
			.where(eq(sessionTable.id, ctx.session.id));

		const sessionToken = await createSession(ctx, userId);

		return ok({ revokedSessions, sessionToken }, "密码已修改");
	});
