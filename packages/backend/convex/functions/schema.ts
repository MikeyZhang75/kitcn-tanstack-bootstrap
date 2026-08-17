import {
	boolean,
	convexTable,
	defineSchema,
	id,
	index,
	text,
	textEnum,
	timestamp,
} from "kitcn/orm";

import { INVITATION_STATUSES } from "../shared/tables/invitations";
import { SESSION_STATUSES } from "../shared/tables/session";
import { USER_ROLES } from "../shared/tables/user";

// Our own user system (no Better Auth). The user row holds only identity +
// authorization; credentials live in a sibling table so user projections never
// carry the password hash.
export const userTable = convexTable(
	"user",
	{
		// Canonical login handle, lowercased on write. Unique → looked up
		// directly during sign-in / sign-up.
		username: text().notNull().unique(),
		// Display name (original-cased). Rendered in the sidebar user menu.
		name: text().notNull(),
		role: textEnum(USER_ROLES).notNull(),
	},
	(userTable) => [index("role").on(userTable.role)],
);

// One credential row per user. Holds the scrypt PHC string only — kept off the
// `user` table so reads of a user never expose the hash.
//
// No explicit index is declared, and none should be: `.unique()` on `userId`
// already materialises a real Convex index (`credentials_userId_unique`), so
// the by-userId lookups in sign-in / change-password are index-backed. Adding
// `index("userId")` would create a second index over the same field and make
// every credential write pay for it twice. (Contrast `sessionTable` below,
// which DOES declare one — `session.userId` is not unique.)
export const credentialsTable = convexTable("credentials", {
	userId: id("user")
		.notNull()
		.unique()
		.references(() => userTable.id),
	passwordHash: text().notNull(),
	// Password-change audit. Nullable: rows written before this landed have
	// neither, and a password that has never been changed has nothing to record.
	// `passwordUpdatedBy` is the acting admin for a forced reset and the user
	// themselves for a self-service change.
	//
	// Without these two columns an admin rewriting someone's credential leaves
	// no direct trace at all: the terminated session rows are only an indirect
	// one, and an account with no live sessions produces not even that.
	passwordUpdatedAt: timestamp(),
	passwordUpdatedBy: id("user").references(() => userTable.id),
});

// Opaque-token sessions. The `token` is the bearer credential held in the
// client's localStorage; there is no JWT, so `status` + `expiresAt` are the
// source of truth. `token` is unique → looked up directly by the cRPC auth
// middleware on every authenticated call.
//
// Rows are **never deleted** — signing out, admin revocation, and a password
// change all flip `status`, so the table doubles as the login audit trail
// (which is why there is no separate login-log table). See
// docs/feature-session-audit.md.
export const sessionTable = convexTable(
	"session",
	{
		token: text().notNull().unique(),
		userId: id("user")
			.notNull()
			.references(() => userTable.id),
		// `active` | `signed_out` (user signed out) | `revoked` (admin kicked) |
		// `password_changed` (the account's password was changed, by its owner or
		// by an admin reset, voiding every credential minted before it).
		// "Expired" is deliberately NOT a status — it's derived from `expiresAt`
		// vs. now, and making it a status would need a cron to maintain.
		//
		// `.notNull()` since `20260816_234850_backfill_session_status` completed:
		// every row now carries a real status, which is what lets the compound
		// index below be queried with an equality on it. A nullable column would
		// have made `eq(status, "active")` silently skip the pre-backfill rows.
		status: textEnum(SESSION_STATUSES).notNull(),
		expiresAt: timestamp().notNull(),
		// Bumped by the `session.heartbeat` mutation only — Convex queries can't
		// write, and this app's authenticated traffic is almost entirely queries.
		// Null until the first heartbeat lands.
		lastSeenAt: timestamp(),
		// When the session left `active`, by either path. `revokedBy` names the
		// admin who kicked it and stays null for a self-service sign-out.
		endedAt: timestamp(),
		revokedBy: id("user").references(() => userTable.id),
		// Best-effort client attribution captured when the session was minted,
		// from Convex's `ctx.meta.getRequestMetadata()`. Nullable on purpose:
		// rows minted before this landed have neither, and Convex reports null
		// for executions with no request behind them (scheduler, crons, CLI).
		// ⚠️ Advisory telemetry only — see shared/tables/session.ts for why the
		// IP must never gate authorization.
		ipAddress: text(),
		userAgent: text(),
	},
	(sessionTable) => [
		// Load-bearing: the /users/$userId page lists a user's sessions and the
		// /users list aggregates active-session counts, both by userId alone.
		index("userId").on(sessionTable.userId),
		// Backs bulk termination (lib/end-user-sessions.ts). Field order matters:
		// kitcn scores an index by how its fields line up with the ones the filter
		// references, so `("userId", "status")` is what makes
		// `and(eq(userId, …), eq(status, "active"))` compile to a real index range
		// rather than an index scan plus a post-filter. Without it the read window
		// is "the N newest rows whatever their status", and bulk termination
		// cannot reach past the first N — see end-user-sessions.ts.
		index("userId_status").on(sessionTable.userId, sessionTable.status),
		index("expiresAt").on(sessionTable.expiresAt),
	],
);

export const invitationsTable = convexTable("invitations", {
	code: text().notNull().unique(),
	status: textEnum(INVITATION_STATUSES).notNull(),
	usedAt: timestamp(),
	// Both `usedBy` (consumer) and `createdBy` (admin who minted) are typed
	// as `v.id("user")` — reads come back narrowed to `Id<"user">` and the
	// `list` procedure resolves both to usernames via a single batched
	// user-table lookup.
	usedBy: id("user").references(() => userTable.id),
	createdBy: id("user").references(() => userTable.id),
});

// Global app settings — a single-row (singleton) table. There is at most one
// row: reads default when it's absent (see functions/settings.ts), and the
// admin toggle on the dashboard /settings page upserts it. No key/index needed
// — the singleton is fetched via `findFirst`.
export const settingsTable = convexTable("settings", {
	// When true (default), signup requires a valid invitation code; when false,
	// registration is open and `signUpWithInvitation` skips the invitation check.
	requireInvitationCode: boolean().notNull(),
});

export const tables = {
	user: userTable,
	credentials: credentialsTable,
	session: sessionTable,
	invitations: invitationsTable,
	settings: settingsTable,
};

// No `.relations(...)`: nothing in the app traverses relations (the
// invitations list resolves usernames via a manual batched `findMany + inArray`,
// and session/credential lookups are direct by token / userId). Declaring a
// 1:1 user↔credentials pair as required `one()` on both sides also trips
// kitcn's circular-dependency guard, so we keep the schema relation-free and
// query explicitly.
export default defineSchema(tables);
