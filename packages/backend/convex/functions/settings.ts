import { eq } from "kitcn/orm";

import { authMutation, publicQuery } from "../lib/crpc";
import { ok } from "../lib/responses";
import {
	DEFAULT_REGISTRATION_SETTINGS,
	setRequireInvitationCodeInputSchema,
} from "../shared/tables/settings";
import { settingsTable } from "./schema";

// Public read of the singleton registration settings. Public because the web
// signup form (unauthenticated) needs to know whether to show / require the
// invitation field; the dashboard /settings page reuses the same query. Only a
// single, non-sensitive boolean is exposed. Defaults when the row is absent.
export const getRegistrationSettings = publicQuery.query(async ({ ctx }) => {
	const row = await ctx.orm.query.settings.findFirst({
		columns: { requireInvitationCode: true },
	});
	return ok({
		requireInvitationCode:
			row?.requireInvitationCode ??
			DEFAULT_REGISTRATION_SETTINGS.requireInvitationCode,
	});
});

// Admin-only toggle. Upserts the singleton: update the existing row, or insert
// the first one. `getRegistrationSettings` is a live Convex subscription, so
// the dashboard switch and the web signup form both reflect the change as soon
// as the mutation commits.
export const setRequireInvitationCode = authMutation
	.requires(["admin"])
	.input(setRequireInvitationCodeInputSchema)
	.mutation(async ({ ctx, input }) => {
		const existing = await ctx.orm.query.settings.findFirst({
			columns: { id: true },
		});
		if (existing) {
			await ctx.orm
				.update(settingsTable)
				.set({ requireInvitationCode: input.requireInvitationCode })
				.where(eq(settingsTable.id, existing.id));
		} else {
			await ctx.orm
				.insert(settingsTable)
				.values({ requireInvitationCode: input.requireInvitationCode });
		}
		return ok({ requireInvitationCode: input.requireInvitationCode });
	});
