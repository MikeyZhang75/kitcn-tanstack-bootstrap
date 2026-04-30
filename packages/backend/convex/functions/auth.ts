import { username } from "better-auth/plugins";
import { convex } from "kitcn/auth";

import { getEnv } from "../lib/get-env";
import authConfig from "./auth.config";
import { defineAuth } from "./generated/auth";

export default defineAuth(() => ({
	emailAndPassword: {
		enabled: true,
	},
	// First entry is the "primary" app — Better Auth uses it for generated
	// links (emails, redirects). Additional entries (e.g. admin dashboard) are
	// only honored via `trustedOrigins` below.
	baseURL: getEnv().SITE_URLS[0],
	user: {
		additionalFields: {
			// Tells Better Auth the `user` table has a custom `role` column so
			// the adapter loads it onto the session user — otherwise the convex
			// plugin's `definePayload` wouldn't see it and it'd never make it
			// into the JWT.
			role: {
				type: "string",
				required: true,
				defaultValue: "user",
				input: false,
			},
		},
	},
	plugins: [
		convex({
			authConfig,
			jwks: getEnv().JWKS,
			jwt: {
				// Mirror the convex plugin default (spread user minus id/image),
				// then pin `role` + `username` explicitly so they're guaranteed in
				// every JWT and survive if the default payload shape ever changes
				// upstream. `displayUsername` intentionally stays out of the JWT —
				// frontend gates don't need it and smaller payloads are cheaper.
				definePayload: ({ user }) => ({
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
					role: user.role,
					username: user.username,
				}),
			},
		}),
		username(),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24 * 15,
	},
	telemetry: { enabled: false },
	trustedOrigins:
		getEnv().DEPLOY_ENV === "development"
			? ["http://localhost:*", "https://*.localhost"]
			: getEnv().SITE_URLS,
}));
