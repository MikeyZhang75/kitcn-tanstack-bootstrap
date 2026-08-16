import { skipToken } from "@tanstack/react-query";

// Runtime half of `useAuthedCRPC` (see use-authed-crpc.ts for the typed hook
// and the rationale). Kept free of React and of the cRPC context so it stays
// directly exercisable in isolation.

// Methods whose *first* parameter is the procedure's args object.
const ARGS_METHODS = new Set([
	"queryOptions",
	"staticQueryOptions",
	"infiniteQueryOptions",
	"queryKey",
	"queryFilter",
	"infiniteQueryKey",
]);

// Subset of the above returning TanStack query options — the ones where a
// missing token should become `enabled: false` rather than a doomed round trip.
const QUERY_OPTIONS_METHODS = new Set([
	"queryOptions",
	"staticQueryOptions",
	"infiniteQueryOptions",
]);

// Leaf members that take no args object and need no wrapping.
const PASSTHROUGH = new Set(["mutationKey", "meta"]);

type AnyFn = (...args: never[]) => unknown;

function injectArgs(args: unknown, sessionToken: string): unknown {
	// `skipToken` is a sentinel, not an args object — forwarding it unchanged is
	// what keeps `queryOptions(skipToken)` working as a conditional-query escape.
	if (args === skipToken) return args;
	return { ...(args as object | undefined), sessionToken };
}

/**
 * Wrap a kitcn cRPC options proxy so every procedure call carries
 * `sessionToken`.
 *
 * @param node - a cRPC proxy node (root, namespace, or procedure)
 * @param sessionToken - current token, or `null` when signed out
 */
export function createAuthedCRPCProxy<T extends object>(
	node: T,
	sessionToken: string | null,
): T {
	// `?? ""` matches the pre-proxy behavior: the `_authenticated` layout only
	// renders children once a token exists, so this is belt-and-braces. Queries
	// additionally get `enabled: false` below, so an empty token never reaches
	// the wire; mutations fired while signed out still fail server-side, exactly
	// as they did when call sites wrote `useSessionToken() ?? ""` by hand.
	const token = sessionToken ?? "";

	return new Proxy(node, {
		get(target, prop, receiver) {
			if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);

			const value: unknown = Reflect.get(target, prop, receiver);

			if (prop === "mutationOptions") {
				return (opts?: unknown) => {
					const base = (value as AnyFn)(opts as never) as {
						mutationFn?: (vars: unknown) => unknown;
					};
					const { mutationFn } = base;
					if (typeof mutationFn !== "function") return base;
					// Wrapping `mutationFn` (rather than pre-binding args) keeps the
					// variables TanStack hands to onMutate/onSuccess/onError equal to
					// what the caller passed to `.mutate()` — token-free, matching the
					// erased type.
					return {
						...base,
						mutationFn: (vars: unknown) =>
							mutationFn({
								...(vars as object | undefined),
								sessionToken: token,
							}),
					};
				};
			}

			if (ARGS_METHODS.has(prop)) {
				return (args?: unknown, opts?: unknown) => {
					const result = (value as AnyFn)(
						injectArgs(args, token) as never,
						opts as never,
					);
					if (sessionToken == null && QUERY_OPTIONS_METHODS.has(prop)) {
						return { ...(result as object), enabled: false };
					}
					return result;
				};
			}

			if (PASSTHROUGH.has(prop)) return value;
			if (value == null) return value;

			// Everything else is a namespace/procedure node to recurse into. Note we
			// can't branch on `typeof value` here: kitcn builds its tree as
			// `new Proxy(() => {}, …)`, so intermediate nodes report as "function"
			// too. Dispatching on the known method names above is the only reliable
			// split.
			if (typeof value !== "object" && typeof value !== "function") {
				return value;
			}
			return createAuthedCRPCProxy(value as object, sessionToken);
		},
	});
}
