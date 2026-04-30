import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { convexClient } from "kitcn/auth/client";
import { createAuthMutations } from "kitcn/react";

import { env } from "@/env";

export const authClient = createAuthClient({
	baseURL:
		typeof window === "undefined" ? env.VITE_SITE_URL : window.location.origin,
	plugins: [convexClient(), usernameClient()],
});

export const { useSignOutMutationOptions } = createAuthMutations(authClient);
