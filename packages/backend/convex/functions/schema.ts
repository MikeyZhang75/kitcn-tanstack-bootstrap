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

export const userTable = convexTable("user", {
	name: text().notNull(),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull(),
	image: text(),
	createdAt: timestamp().notNull(),
	updatedAt: timestamp().notNull(),
	userId: text(),
	role: textEnum(USER_ROLES).notNull(),
	// Better Auth username plugin stores the normalized (lowercased) handle
	// in `username` and the original-cased form in `displayUsername`. Both
	// must exist on the table even though we don't surface `displayUsername`
	// in UI — the plugin has an auto-fill middleware that copies `username`
	// into `displayUsername` on every sign-up (see
	// better-auth/plugins/username/index.mjs: `ctx.body.displayUsername =
	// ctx.body.username`), and the Convex adapter rejects inserts with
	// fields not in the schema. Both are optional at the column level for
	// legacy rows pre-dating the plugin.
	username: text().unique(),
	displayUsername: text(),
});

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

export const sessionTable = convexTable(
	"session",
	{
		expiresAt: timestamp().notNull(),
		token: text().notNull().unique(),
		createdAt: timestamp().notNull(),
		updatedAt: timestamp().notNull(),
		ipAddress: text(),
		userAgent: text(),
		userId: text()
			.notNull()
			.references(() => userTable.id),
	},
	(sessionTable) => [
		index("expiresAt").on(sessionTable.expiresAt),
		index("expiresAt_userId").on(sessionTable.expiresAt, sessionTable.userId),
		index("userId").on(sessionTable.userId),
	],
);

export const accountTable = convexTable(
	"account",
	{
		accountId: text().notNull(),
		providerId: text().notNull(),
		userId: text()
			.notNull()
			.references(() => userTable.id),
		accessToken: text(),
		refreshToken: text(),
		idToken: text(),
		accessTokenExpiresAt: timestamp(),
		refreshTokenExpiresAt: timestamp(),
		scope: text(),
		password: text(),
		createdAt: timestamp().notNull(),
		updatedAt: timestamp().notNull(),
	},
	(accountTable) => [
		index("accountId").on(accountTable.accountId),
		index("accountId_providerId").on(
			accountTable.accountId,
			accountTable.providerId,
		),
		index("providerId_userId").on(accountTable.providerId, accountTable.userId),
		index("userId").on(accountTable.userId),
	],
);

export const verificationTable = convexTable(
	"verification",
	{
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: timestamp().notNull(),
		createdAt: timestamp().notNull(),
		updatedAt: timestamp().notNull(),
	},
	(verificationTable) => [
		index("expiresAt").on(verificationTable.expiresAt),
		index("identifier").on(verificationTable.identifier),
	],
);

export const jwksTable = convexTable("jwks", {
	publicKey: text().notNull(),
	privateKey: text().notNull(),
	createdAt: timestamp().notNull(),
	expiresAt: timestamp(),
});

export const tables = {
	user: userTable,
	session: sessionTable,
	account: accountTable,
	verification: verificationTable,
	jwks: jwksTable,
	invitations: invitationsTable,
};

export default defineSchema(tables).relations((r) => ({
	user: {
		sessions: r.many.session({
			from: r.user.id,
			to: r.session.userId,
		}),
		accounts: r.many.account({
			from: r.user.id,
			to: r.account.userId,
		}),
	},
	session: {
		user: r.one.user({
			from: r.session.userId,
			to: r.user.id,
		}),
	},
	account: {
		user: r.one.user({
			from: r.account.userId,
			to: r.user.id,
		}),
	},
}));
