import { z } from "zod";

// ─── Session lifetime ────────────────────────────────────────────────────────
// Sessions live 30 days from creation (matching the prior Better Auth
// `expiresIn`). Expiry is absolute, not sliding — a fresh sign-in mints a new
// row, so active users re-up naturally and idle sessions lapse after the
// window. The cRPC auth middleware rejects rows past `expiresAt`.

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// ─── Token shape ─────────────────────────────────────────────────────────────
// 64 lowercase hex chars (32 random bytes — see lib/session-token.ts). Validated
// on the wire so a malformed token is rejected before any DB lookup. Shared by
// the auth middleware (merged into every authed procedure's input) and the
// explicit signOut input.

export const SESSION_TOKEN_PATTERN = "[0-9a-f]{64}";

export const sessionTokenSchema = z
	.string()
	.regex(new RegExp(`^${SESSION_TOKEN_PATTERN}$`), "会话令牌无效");

export const signOutInputSchema = z.object({
	sessionToken: sessionTokenSchema,
});
