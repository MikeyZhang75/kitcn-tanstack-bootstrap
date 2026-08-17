import type { QueryCtx } from "../functions/generated/server";

// kitcn compiles `inArray` as a left-folded chain of `q.or()` calls, which
// creates N levels of JSON nesting for N values. Convex's server-side JSON
// parser has a ~64-level recursion limit, so large arrays blow up. 30 keeps
// us well under the limit with comfortable headroom for future query depth.
export const IN_ARRAY_BATCH_SIZE = 30;

/**
 * Run `runQuery` against `values` in chunks of {@link IN_ARRAY_BATCH_SIZE}
 * and concatenate the results. Callsites pass a lambda that captures the
 * target table (`ctx.orm.query.<table>`) and applies `inArray(fields.<col>,
 * batch)` — this helper owns the chunking loop so the recursion-limit
 * constraint lives in one place.
 */
export async function chunkedInArray<TValue, TResult>(
	values: readonly TValue[],
	runQuery: (batch: TValue[]) => Promise<readonly TResult[]>,
): Promise<TResult[]> {
	const results: TResult[] = [];
	for (let i = 0; i < values.length; i += IN_ARRAY_BATCH_SIZE) {
		const batch = values.slice(i, i + IN_ARRAY_BATCH_SIZE);
		results.push(...(await runQuery(batch)));
	}
	return results;
}

/**
 * Resolve `user` ids to usernames in one batched lookup, for list procedures
 * that render a human-readable owner column. Shared by the invitations list
 * (`createdBy` / `usedBy`) and the session list (`revokedBy`) — each holds raw
 * `Id<"user">` columns and needs the same id → username projection.
 *
 * Ids that don't resolve (user deleted after the referencing row was written)
 * are simply absent from the returned map; call sites fall through to the raw
 * id or an em-dash rather than failing the whole page.
 */
export async function resolveUsernames(
	ctx: Pick<QueryCtx, "orm">,
	ids: string[],
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	if (ids.length === 0) return result;
	const users = await chunkedInArray(ids, (batch) =>
		ctx.orm.query.user.findMany({
			where: (fields, { inArray }) => inArray(fields.id, batch),
			columns: { id: true, username: true },
			limit: batch.length,
		}),
	);
	for (const user of users) {
		// `username` is the canonical handle (lowercased on signup) and is a
		// required column, so it's always present — the guard is belt-and-braces.
		if (user.username) {
			result.set(user.id, user.username);
		}
	}
	return result;
}
