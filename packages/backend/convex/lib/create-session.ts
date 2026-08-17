import type { Id } from "../functions/_generated/dataModel";
import type { MutationCtx } from "../functions/generated/server";
import { sessionTable } from "../functions/schema";
import {
	DEFAULT_SESSION_STATUS,
	SESSION_TTL_MS,
} from "../shared/tables/session";
import { generateSessionToken } from "./session-token";

/**
 * The single way a session is created. Mints the token and writes the
 * `session` row, stamped with the request's IP / User-Agent — kept in one
 * place so a future third sign-in path can't silently skip the attribution.
 *
 * `ctx.meta.getRequestMetadata()` is Convex's per-request metadata, available
 * on mutations and actions but **not** on queries. Both callers here
 * (`session.signIn`, `signup.signUpWithInvitation`) are mutations.
 *
 * ⚠️ `ip` is derived from the leftmost `x-forwarded-for` entry and is
 * therefore client-spoofable — audit telemetry only, never an authorization
 * input. See shared/tables/session.ts for the full caveat list.
 *
 * ⚠️ The metadata object also carries `authToken` (a raw JWT). Destructure the
 * two fields we want; never log the whole object.
 */
export async function createSession(
	ctx: MutationCtx,
	userId: Id<"user">,
): Promise<string> {
	// Read the metadata immediately before the write so the "any throw leaves
	// nothing written" property of the signup transaction stays obvious.
	const { ip, userAgent } = await ctx.meta.getRequestMetadata();
	const sessionToken = generateSessionToken();

	await ctx.orm.insert(sessionTable).values({
		token: sessionToken,
		userId,
		status: DEFAULT_SESSION_STATUS,
		expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		ipAddress: ip,
		userAgent,
	});

	return sessionToken;
}
