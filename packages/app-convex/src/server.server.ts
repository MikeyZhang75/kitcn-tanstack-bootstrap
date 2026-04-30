import { api } from "@repo/backend/shared/api";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createCallerFactory } from "kitcn/server";

import { getToken } from "./auth-server";

const { createContext, createCaller } = createCallerFactory({
	api,
	convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL as string,
	auth: {
		getToken: async () => {
			return {
				token: await getToken(),
			};
		},
	},
});

export type ServerCaller = ReturnType<typeof createCaller>;

async function makeContext() {
	const headers = await getRequestHeaders();
	return createContext({ headers });
}

export function createServerCaller(): ServerCaller {
	return createCaller(async () => {
		return await makeContext();
	});
}
