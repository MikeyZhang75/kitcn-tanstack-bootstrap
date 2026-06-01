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
export const credentialsTable = convexTable("credentials", {
	userId: id("user")
		.notNull()
		.unique()
		.references(() => userTable.id),
	passwordHash: text().notNull(),
});

// Opaque-token sessions. The `token` is the bearer credential held in the
// client's localStorage; the row's existence + `expiresAt` is the source of
// truth (no JWT). `token` is unique → looked up directly by the cRPC auth
// middleware on every authenticated call.
export const sessionTable = convexTable(
	"session",
	{
		token: text().notNull().unique(),
		userId: id("user")
			.notNull()
			.references(() => userTable.id),
		expiresAt: timestamp().notNull(),
	},
	(sessionTable) => [
		index("userId").on(sessionTable.userId),
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
