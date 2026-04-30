import { api } from "@repo/backend/shared/api";
import { createCRPCContext } from "kitcn/react";

export const { CRPCProvider, useCRPC, useCRPCClient } = createCRPCContext({
	api,
	convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL as string,
});
