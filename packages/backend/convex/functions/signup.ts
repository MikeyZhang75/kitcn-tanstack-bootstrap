import { eq } from "kitcn/orm";

import { createSession } from "../lib/create-session";
import { publicMutation } from "../lib/crpc";
import { hashPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import { DEFAULT_REGISTRATION_SETTINGS } from "../shared/tables/settings";
import { signUpWithInvitationInputSchema } from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import { credentialsTable, invitationsTable, userTable } from "./schema";

// Signup. One transactional mutation: (optionally) validate the invitation,
// create the user + credential, (optionally) consume the invitation, and mint a
// session — then return the token so the client is signed in immediately (no
// separate sign-in round trip). All of this is atomic; if any step throws,
// nothing is written (the invitation is not consumed).
//
// Whether an invitation is required is the live `settings.requireInvitationCode`
// flag (default true, see shared/tables/settings.ts): when on, the caller must
// supply a valid `active` code, which is consumed below; when an admin has
// opened registration from the dashboard /settings page, the code is ignored.
export const signUpWithInvitation = publicMutation
	.input(signUpWithInvitationInputSchema)
	.mutation(async ({ ctx, input }) => {
		const settings = await ctx.orm.query.settings.findFirst({
			columns: { requireInvitationCode: true },
		});
		const requireInvitationCode =
			settings?.requireInvitationCode ??
			DEFAULT_REGISTRATION_SETTINGS.requireInvitationCode;

		// Validate the invitation up front so a missing/bad/used/revoked code is
		// rejected before any row is written; the matched row's id is consumed
		// after user creation. When registration is open, skip this entirely.
		let invitationId: string | null = null;
		if (requireInvitationCode) {
			if (!input.invitationCode) {
				throw error("BAD_REQUEST", "邀请码无效");
			}
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
			invitationId = invitation.id;
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

		// Consume the invitation only when one was required and matched.
		if (invitationId) {
			await ctx.orm
				.update(invitationsTable)
				.set({ status: "used", usedAt: new Date(), usedBy: userId })
				.where(eq(invitationsTable.id, invitationId));
		}

		// Mints the session row, stamped with the request's IP / User-Agent.
		// Still inside the same transaction as the user + credential inserts.
		const sessionToken = await createSession(ctx, userId);

		return ok({ sessionToken });
	});
