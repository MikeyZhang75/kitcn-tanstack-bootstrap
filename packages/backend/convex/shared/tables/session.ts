import { z } from "zod";

// ─── Session lifetime ────────────────────────────────────────────────────────
// Sessions live 30 days from creation (matching the prior Better Auth
// `expiresIn`). Expiry is absolute, not sliding — a fresh sign-in mints a new
// row, so active users re-up naturally and idle sessions lapse after the
// window. The cRPC auth middleware rejects rows past `expiresAt`.

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

// ─── Status state machine ────────────────────────────────────────────────────
// `active`     — usable credential.
// `signed_out` — the user signed out themselves.
// `revoked`    — an admin kicked the session from the dashboard.
//
// Session rows are **never deleted**; both terminal transitions are updates
// that also stamp `endedAt` (and `revokedBy` for the admin path). That is what
// lets the session table serve as the login audit trail — an earlier design
// deleted the row on sign-out and needed a separate append-only log table to
// compensate.
//
// "Expired" is deliberately NOT a status: it's derived by comparing
// `expiresAt` against the current time. Materialising it would require a cron
// to flip rows, with nothing gained — the auth middleware checks both.

export const SESSION_STATUSES = ["active", "signed_out", "revoked"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DEFAULT_SESSION_STATUS: SessionStatus = "active";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
	active: "活跃",
	signed_out: "已退出",
	revoked: "已终止",
};

/** 状态为 active 但已过 `expiresAt` 的行在界面上单独显示为「已过期」。 */
export const SESSION_EXPIRED_LABEL = "已过期";

// ─── Liveness (`lastSeenAt`) ─────────────────────────────────────────────────
// `lastSeenAt` is bumped **only** by the `session.heartbeat` mutation, which
// the client fires on an interval. It cannot be maintained on ordinary
// authenticated traffic: Convex queries can't write (`QueryCtx.db` is a reader),
// and nearly all authenticated traffic in this app is queries — `session.me` is
// a standing subscription and every list page is a query.
//
// The client fires at `HEARTBEAT_INTERVAL_MS`; the server additionally skips
// the write when the stored value is newer than `LAST_SEEN_THROTTLE_MS`, which
// is what keeps N open tabs from contending (OCC) on the same session row.

export const HEARTBEAT_INTERVAL_MS = 1000 * 60 * 5;
export const LAST_SEEN_THROTTLE_MS = 1000 * 60;

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

// ─── Request metadata (ipAddress / userAgent) ────────────────────────────────
// Both columns are filled from Convex's `ctx.meta.getRequestMetadata()` at the
// moment the session is minted (see lib/create-session.ts). Two properties of
// that value are load-bearing and must not be forgotten:
//
// 1. **The IP is client-spoofable.** Convex derives it from the *leftmost*
//    `x-forwarded-for` entry, and the edge in front of the deployment appends
//    to that header rather than replacing it — so a caller that sends its own
//    `X-Forwarded-For` can decide what gets recorded. Treat the value as an
//    audit/telemetry hint ONLY. Never gate authorization, bans, or rate limits
//    on it.
// 2. **On the WebSocket transport the IP is sampled at connect time** and stays
//    frozen for the life of the socket, so a long-lived tab that changes
//    network (mobile handover, VPN toggle) keeps reporting the original value.
//
// Convex also truncates the values it hands back (IP at 256 bytes, User-Agent
// at 512), so no additional length validation is needed on the write path.

// ─── Procedure input schemas ─────────────────────────────────────────────────
// Offset pagination for a single user's session list, mirroring the invitations
// list (see shared/tables/invitations.ts for why the page size is capped).

export const SESSION_LIST_PAGE_SIZE_MAX = 100;

export const listUserSessionsInputSchema = z.object({
	userId: z.string().min(1),
	page: z.number().int().nonnegative(),
	pageSize: z.number().int().min(1).max(SESSION_LIST_PAGE_SIZE_MAX),
});

export const countUserSessionsInputSchema = z.object({
	userId: z.string().min(1),
});

export const revokeSessionInputSchema = z.object({
	id: z.string().min(1),
});

export const revokeUserSessionsInputSchema = z.object({
	userId: z.string().min(1),
});

// Upper bound on how many sessions one `revokeAllForUser` call ends. Convex
// mutations are transactional and bounded, so a user with an implausible number
// of live sessions is drained over repeated calls rather than in one write —
// the mutation returns how many it actually revoked.
export const SESSION_REVOKE_BATCH_MAX = 200;

// Upper bound on the id scan behind `countByUser`. kitcn's `count({ where })`
// needs an `aggregateIndex`, which we don't want to maintain on a table whose
// hottest write is the heartbeat — so the per-user total is a capped scan and
// the response flags when it hit the cap (UI renders "N+").
export const SESSION_COUNT_SCAN_MAX = 1000;
