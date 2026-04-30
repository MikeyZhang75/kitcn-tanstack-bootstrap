"use client";

import { QueryClientProvider as TanstackQueryClientProvider } from "@tanstack/react-query";
import { ConvexAuthProvider } from "kitcn/auth/client";
import {
	ConvexReactClient,
	getConvexQueryClientSingleton,
	getQueryClientSingleton,
	useAuthStore,
} from "kitcn/react";
import type { ComponentProps, ReactNode } from "react";

import { CRPCProvider } from "./crpc";
import { createQueryClient } from "./query-client";

type AuthClient = ComponentProps<typeof ConvexAuthProvider>["authClient"];

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

export function AppConvexProvider({
	authClient,
	children,
}: {
	authClient: AuthClient;
	children: ReactNode;
}) {
	return (
		<ConvexAuthProvider authClient={authClient} client={convex}>
			<QueryProvider>{children}</QueryProvider>
		</ConvexAuthProvider>
	);
}

function QueryProvider({ children }: { children: ReactNode }) {
	const authStore = useAuthStore();
	const queryClient = getQueryClientSingleton(createQueryClient);
	const convexQueryClient = getConvexQueryClientSingleton({
		authStore,
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
