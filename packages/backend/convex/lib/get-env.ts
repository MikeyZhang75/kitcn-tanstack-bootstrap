import { createEnv } from "kitcn/server";
import { z } from "zod";

const envSchema = z.object({
	DEPLOY_ENV: z.string().default("production"),
	SITE_URLS: z
		.string()
		.default("http://localhost:3000")
		.transform((value) =>
			value
				.split(",")
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0),
		)
		.pipe(z.array(z.url()).nonempty()),
	BETTER_AUTH_SECRET: z.string().optional(),
	JWKS: z.string().optional(),
});

export const getEnv = createEnv({
	schema: envSchema,
});
