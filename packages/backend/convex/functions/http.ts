import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "kitcn/auth/http";
import { createHttpRouter } from "kitcn/server";

import { router } from "../lib/crpc";
import { getEnv } from "../lib/get-env";
import { getAuth } from "./generated/auth";

// __KITCN_HTTP_IMPORTS__

const app = new Hono();

app.use(
	"/api/*",
	cors({
		origin: getEnv().SITE_URLS,
		allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie"],
		exposeHeaders: ["Set-Better-Auth-Cookie"],
		credentials: true,
	}),
);

app.use(authMiddleware(getAuth));

export const httpRouter = router({
	// __KITCN_HTTP_ROUTES__
});

export default createHttpRouter(app, httpRouter);
