import { convexBetterAuthReactStart } from "kitcn/auth/start";

export const {
	handler,
	getToken,
	fetchAuthQuery,
	fetchAuthMutation,
	fetchAuthAction,
} = convexBetterAuthReactStart({
	convexUrl: import.meta.env.VITE_CONVEX_URL as string,
	convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL as string,
});
