import { eq } from "kitcn/orm";

import { publicMutation } from "../lib/crpc";
import { hashPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import { generateSessionToken } from "../lib/session-token";
import { SESSION_TTL_MS } from "../shared/tables/session";
import { signUpWithInvitationInputSchema } from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import {
	credentialsTable,
	invitationsTable,
	sessionTable,
	userTable,
} from "./schema";

// Invitation-gated signup. One transactional mutation: validate the invitation,
// create the user + credential, consume the invitation, and mint a session —
// then return the token so the client is signed in immediately (no separate
// sign-in round trip). All of this is atomic; if any step throws, nothing is
// written (the invitation is not consumed).
export const signUpWithInvitation = publicMutation
	.input(signUpWithInvitationInputSchema)
	.mutation(async ({ ctx, input }) => {
		const invitation = await ctx.orm.query.invitations.findFirst({
			where: { code: input.invitationCode },
			columns: { id: true, status: true },
		});
		if (!invitation) {
			throw error("BAD_REQUEST", "邀请码无效");
		}
		if (invitation.status === "used") {
			throw error("BAD_REQUEST", "邀请码已被使用");
		}
		if (invitation.status === "revoked") {
			throw error("BAD_REQUEST", "邀请码已撤销");
		}

		// Lowercase the canonical handle (case-insensitive login); keep the
		// original-cased input as the display `name`.
		const username = input.username.toLowerCase();
		const existing = await ctx.orm.query.user.findFirst({
			where: { username },
			columns: { id: true },
		});
		if (existing) {
			throw error("CONFLICT", "用户名已被使用，请更换");
		}

		const passwordHash = hashPassword(input.password);

		const [user] = await ctx.orm
			.insert(userTable)
			.values({ username, name: input.username, role: "user" })
			.returning();
		if (!user) {
			throw error("INTERNAL_SERVER_ERROR", "创建用户失败");
		}
		// kitcn surfaces a row's `id` as `string`; FK columns are branded
		// `Id<"user">`. Brand once and reuse (matches the repo convention).
		const userId = user.id as Id<"user">;

		await ctx.orm.insert(credentialsTable).values({ userId, passwordHash });

		await ctx.orm
			.update(invitationsTable)
			.set({ status: "used", usedAt: new Date(), usedBy: userId })
			.where(eq(invitationsTable.id, invitation.id));

		const sessionToken = generateSessionToken();
		await ctx.orm.insert(sessionTable).values({
			token: sessionToken,
			userId,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		});

		return ok({ sessionToken });
	});
