import { eq } from "kitcn/orm";

import { privateMutation } from "../lib/crpc";
import { error, ok } from "../lib/responses";
import { bootstrapAdminInputSchema } from "../shared/tables/user";
import { getAuth } from "./generated/auth";
import { userTable } from "./schema";

// Mirror of signup.ts's DERIVED_EMAIL_DOMAIN. Better Auth requires a unique
// email on signUpEmail, so username-only signup synthesizes one. Keep these
// two constants in sync — search the repo for the literal "example.com" if
// the domain ever changes.
const DERIVED_EMAIL_DOMAIN = "example.com";

// Operator-only cold-start. Creates the very first admin from a clean
// deployment with no existing user and no invitation code — the only way
// to break the chicken-and-egg between `signUpWithInvitation` (needs an
// invitation) and `invitations.create` (needs an admin). Refuses to run
// once any admin exists; subsequent admins must be promoted manually via
// the Convex dashboard (or by adding a follow-up mutation). Run:
//
//   bunx convex run users:bootstrapAdmin '{"username":"alice","password":"<pw>"}' --prod
//
// After it returns, sign in on the dashboard with that username and the
// session JWT will carry `role: "admin"`.
export const bootstrapAdmin = privateMutation
	.input(bootstrapAdminInputSchema)
	.mutation(async ({ ctx, input }) => {
		const existingAdmin = await ctx.orm.query.user.findFirst({
			where: { role: "admin" },
		});
		if (existingAdmin) {
			throw error("CONFLICT", "已存在管理员账户");
		}

		// Match signup.ts's email derivation so this admin behaves identically
		// to invitation-flow users at the auth layer.
		const derivedEmail = `${input.username.toLowerCase()}@${DERIVED_EMAIL_DOMAIN}`;
		const auth = getAuth(ctx);
		let result: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
		try {
			result = await auth.api.signUpEmail({
				body: {
					email: derivedEmail,
					password: input.password,
					name: input.username,
					username: input.username,
				},
			});
		} catch (e) {
			console.error("bootstrapAdmin signUpEmail failed:", e);
			throw error("BAD_REQUEST", "创建用户失败，请检查用户名或密码");
		}
		if (!result?.user) {
			throw error("INTERNAL_SERVER_ERROR", "创建用户失败");
		}

		// Better Auth wrote `role: "user"` via `additionalFields` defaultValue.
		// Promote the row immediately so the next sign-in mints an admin JWT.
		await ctx.orm
			.update(userTable)
			.set({ role: "admin" })
			.where(eq(userTable.id, result.user.id));

		return ok({ userId: result.user.id });
	});
