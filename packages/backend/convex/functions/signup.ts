import { eq } from "kitcn/orm";

import { publicMutation } from "../lib/crpc";
import { error, ok } from "../lib/responses";
import { signUpWithInvitationInputSchema } from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import { getAuth } from "./generated/auth";
import { invitationsTable } from "./schema";

// Synthetic email domain used when the product only wants username-based
// signup. Better Auth's signUpEmail still requires a unique email, so we
// derive one from the username. Keep this in sync with the auth form copy.
const DERIVED_EMAIL_DOMAIN = "example.com";

export const signUpWithInvitation = publicMutation
	.input(signUpWithInvitationInputSchema)
	.mutation(async ({ ctx, input }) => {
		const invitation = await ctx.orm.query.invitations.findFirst({
			where: { code: input.invitationCode },
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

		// Username has already been validated to `[a-zA-Z0-9_]+`, so interpolating
		// it directly into an email address is safe. Lowercased to align with the
		// username plugin's default normalization — keeps the email's local-part
		// matching the canonical `user.username` value stored in the DB.
		const derivedEmail = `${input.username.toLowerCase()}@${DERIVED_EMAIL_DOMAIN}`;

		const auth = getAuth(ctx);
		let result: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
		try {
			result = await auth.api.signUpEmail({
				body: {
					email: derivedEmail,
					password: input.password,
					// `name` is required by Better Auth's signUpEmail body and by
					// the user table (notNull). Reuse the username verbatim so
					// nav-user.tsx has something to render.
					name: input.username,
					username: input.username,
				},
			});
		} catch (e) {
			// Better Auth's error messages are English and leak internal
			// validation/version details — echoing them verbatim enables username
			// enumeration (registered vs unregistered usernames return different
			// text) and version fingerprinting. Log server-side for debugging,
			// return a generic Simplified Chinese message to the client.
			console.error("signUpEmail failed:", e);
			throw error("BAD_REQUEST", "创建用户失败，请检查用户名或密码");
		}

		if (!result?.user) {
			throw error("INTERNAL_SERVER_ERROR", "创建用户失败");
		}

		await ctx.orm
			.update(invitationsTable)
			.set({
				status: "used",
				usedAt: new Date(),
				usedBy: result.user.id as Id<"user">,
			})
			.where(eq(invitationsTable.id, invitation.id));

		return ok({ userId: result.user.id });
	});
