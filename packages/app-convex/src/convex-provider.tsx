"use client";

import { QueryClientProvider as TanstackQueryClientProvider } from "@tanstack/react-query";
import {
	ConvexProvider,
	ConvexReactClient,
	getConvexQueryClientSingleton,
	getQueryClientSingleton,
} from "kitcn/react";
import type { ReactNode } from "react";

import { CRPCProvider } from "./crpc";
import { createQueryClient } from "./query-client";

// No Better Auth bridge. Identity is carried by the session token in each
// authenticated procedure's input, so the Convex client attaches no auth and
// needs no auth store — `getConvexQueryClientSingleton` takes `authStore?` as
// optional, and we simply omit it.
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

export function AppConvexProvider({ children }: { children: ReactNode }) {
	const queryClient = getQueryClientSingleton(createQueryClient);
	const convexQueryClient = getConvexQueryClientSingleton({
		convex,
		queryClient,
	});

	// `ConvexProvider` supplies the bare Convex React context (`useConvex()`).
	// kitcn's cRPC `mutationOptions()` resolve through `useConvexMutation` from
	// `convex/react`, which reads that context — without this provider every
	// authed/public mutation (e.g. `session.signIn`) throws "Could not find
	// Convex client". Previously `ConvexAuthProvider` (Better Auth) supplied it;
	// with Better Auth gone we mount the plain provider, no auth attached.
	return (
		<ConvexProvider client={convex}>
			<TanstackQueryClientProvider client={queryClient}>
				<CRPCProvider
					convexClient={convex}
					convexQueryClient={convexQueryClient}
				>
					{children}
				</CRPCProvider>
			</TanstackQueryClientProvider>
		</ConvexProvider>
	);
}
