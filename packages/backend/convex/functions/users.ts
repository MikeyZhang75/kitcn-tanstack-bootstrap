import { privateMutation } from "../lib/crpc";
import { hashPassword } from "../lib/password";
import { error, ok } from "../lib/responses";
import { bootstrapAdminInputSchema } from "../shared/tables/user";
import type { Id } from "./_generated/dataModel";
import { credentialsTable, userTable } from "./schema";

// Operator-only cold-start. Creates the very first admin from a clean
// deployment with no existing user and no invitation code — the only way to
// break the chicken-and-egg between `signUpWithInvitation` (needs an
// invitation) and `invitations.create` (needs an admin). Refuses to run once
// any admin exists; subsequent admins are promoted manually via the Convex
// dashboard (edit the user row's `role`). Run:
//
//   bunx convex run users:bootstrapAdmin '{"username":"alice","password":"<pw>"}' --prod
//
// After it returns, sign in on the dashboard with that username + password.
export const bootstrapAdmin = privateMutation
	.input(bootstrapAdminInputSchema)
	.mutation(async ({ ctx, input }) => {
		const existingAdmin = await ctx.orm.query.user.findFirst({
			where: { role: "admin" },
			columns: { id: true },
		});
		if (existingAdmin) {
			throw error("CONFLICT", "已存在管理员账户");
		}

		const username = input.username.toLowerCase();
		const existing = await ctx.orm.query.user.findFirst({
			where: { username },
			columns: { id: true },
		});
		if (existing) {
			throw error("CONFLICT", "用户名已被使用");
		}

		const passwordHash = hashPassword(input.password);
		const [user] = await ctx.orm
			.insert(userTable)
			.values({ username, name: input.username, role: "admin" })
			.returning();
		if (!user) {
			throw error("INTERNAL_SERVER_ERROR", "创建用户失败");
		}
		// kitcn surfaces a row's `id` as `string`; FK columns are branded
		// `Id<"user">`. Brand once and reuse (matches the repo convention).
		const userId = user.id as Id<"user">;
		await ctx.orm.insert(credentialsTable).values({ userId, passwordHash });

		return ok({ userId });
	});
