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
