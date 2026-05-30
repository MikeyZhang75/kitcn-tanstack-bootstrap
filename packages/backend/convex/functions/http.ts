import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHttpRouter } from "kitcn/server";

import { router } from "../lib/crpc";
import { getEnv } from "../lib/get-env";

// __KITCN_HTTP_IMPORTS__

const app = new Hono();

app.use(
	"/api/*",
	cors({
		origin: getEnv().SITE_URLS,
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

export const httpRouter = router({
	// __KITCN_HTTP_ROUTES__
});

export default createHttpRouter(app, httpRouter);
