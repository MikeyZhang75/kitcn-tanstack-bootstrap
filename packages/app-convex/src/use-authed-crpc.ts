"use client";

import type { Api } from "@repo/backend/shared/api";
import type {
	FunctionReference,
	FunctionType,
	FunctionVisibility,
} from "convex/server";
import type { createCRPCContext } from "kitcn/react";
import { useMemo } from "react";

import { createAuthedCRPCProxy } from "./authed-crpc-proxy";
import { useCRPC } from "./crpc";
import { useSessionToken } from "./use-session-token";

// The token-threading layer. Every authenticated procedure declares
// `sessionToken` in its input (see `convex/lib/crpc.ts` — the auth builders
// merge it in), but that's a transport detail: call sites shouldn't have to
// read localStorage and re-spread the token into every single `queryOptions` /
// `mutate` argument object.
//
// `useAuthedCRPC()` returns the same cRPC proxy with the token injected at the
// boundary and `sessionToken` erased from the argument types. Public procedures
// keep using plain `useCRPC()`, and that split is what makes blind injection
// safe: Convex validates procedure args strictly, so slipping a `sessionToken`
// into a public procedure's input is a runtime error. Nothing at runtime can
// tell the two apart — kitcn's generated api leaves only carry `{ type }` meta,
// since the `auth` field is populated by kitcn's own auth runtime, which is
// disabled here — so the choice has to be made at the call site.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// `FunctionArgs<T>` is just `T["_args"]`, so dropping `sessionToken` from that
// one field re-types the whole `CRPCClient` tree — queryOptions, mutationKey,
// MutationVariables and the `IsPaginated` check all derive from it.
//
// The reference has to be *rebuilt* via `infer` rather than patched with
// `Omit<T, "_args">`. kitcn's api leaves are
// `FunctionReference<…> & ApiFunctionLeafMeta & { functionRef }`, and that meta
// carries an `[key: string]: unknown` index signature — which makes
// `keyof leaf` collapse to `string | number`, so `Omit` returns a bare index
// signature and erases `_type` / `_visibility`. The leaf then stops matching
// `extends FunctionReference<'query'>` and `CRPCClient` maps it to `never`.
// The dropped `type` / `functionRef` members are type-level only; the runtime
// proxy still reads them off the real api object.
type StripSessionToken<T> =
	T extends FunctionReference<
		infer Type extends FunctionType,
		infer Vis extends FunctionVisibility,
		infer Args,
		infer Ret,
		infer Path
	>
		? "sessionToken" extends keyof Args
			? FunctionReference<Type, Vis, Omit<Args, "sessionToken">, Ret, Path>
			: T
		: T extends Record<string, unknown>
			? {
					// `http` is a `CRPCHttpRouter`, not a namespace of procedures. Mapping
					// over it would break the structural match `useCRPC` does against
					// `ExtractHttpRouter<TApi>`, so it passes through untouched.
					[K in keyof T]: K extends "http" ? T[K] : StripSessionToken<T[K]>;
				}
			: T;

// `CRPCClient` isn't exported from `kitcn/react`, so we recover it from the
// factory's return type. Instantiating the generic here keeps us pinned to
// whatever kitcn's decorators look like in the installed version.
type CRPCClientOf<TApi extends Record<string, unknown>> = ReturnType<
	ReturnType<typeof createCRPCContext<TApi>>["useCRPC"]
>;

export type AuthedCRPC = CRPCClientOf<StripSessionToken<Api>>;

/**
 * cRPC proxy for **authenticated** procedures, with `sessionToken` injected
 * automatically and erased from the argument types.
 *
 * ```tsx
 * const authed = useAuthedCRPC();
 * const query = useQuery(authed.invitations.list.queryOptions({ page, pageSize }));
 * const revoke = useMutation(authed.invitations.revoke.mutationOptions());
 * revoke.mutate({ id });
 * ```
 *
 * Use plain `useCRPC()` for public procedures (`session.signIn`,
 * `settings.getRegistrationSettings`, …) — handing them a `sessionToken` is a
 * Convex arg-validation error.
 */
export function useAuthedCRPC(): AuthedCRPC {
	const crpc = useCRPC();
	const sessionToken = useSessionToken();

	return useMemo(
		() => createAuthedCRPCProxy(crpc as object, sessionToken) as AuthedCRPC,
		[crpc, sessionToken],
	);
}
