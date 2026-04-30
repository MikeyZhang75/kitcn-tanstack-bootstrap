import type { ServerCaller } from "./server.server";

export type { ServerCaller } from "./server.server";

/**
 * Run a typed cRPC server-call via `createCallerFactory`.
 *
 * The underlying `./server.server.ts` module imports
 * `@tanstack/react-start/server` and `./auth-server` (which pulls
 * `@convex-dev/better-auth/react-start`) at top level. Both are
 * server-only graphs — if they land in the client bundle,
 * `tanstack-start-core:import-protection` rejects the build and
 * `@convex-dev/better-auth`'s nested
 * `import("@tanstack/react-start/server")` 404s at runtime.
 *
 * Keeping the public entry here and dynamic-importing the
 * implementation inside the handler is the same escape-hatch used
 * by `auth-guard.ts`. Do NOT hoist the import to the top of this
 * file even though it looks convenient.
 */
export async function runServerCall<T>(
	fn: (caller: ServerCaller) => Promise<T> | T,
): Promise<T> {
	const { createServerCaller } = await import("./server.server");
	return fn(createServerCaller());
}
