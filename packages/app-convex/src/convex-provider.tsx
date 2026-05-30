"use client";

import { QueryClientProvider as TanstackQueryClientProvider } from "@tanstack/react-query";
import {
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

	return (
		<TanstackQueryClientProvider client={queryClient}>
			<CRPCProvider convexClient={convex} convexQueryClient={convexQueryClient}>
				{children}
			</CRPCProvider>
		</TanstackQueryClientProvider>
	);
}
