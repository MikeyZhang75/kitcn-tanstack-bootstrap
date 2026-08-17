import { defineMigration } from "../generated/migrations.gen";

// Backfill `session.status` so the column can be hardened to `.notNull()`.
//
// Sessions used to be identified purely by existence + `expiresAt`; sign-out
// DELETED the row. Every row that survived to this point was therefore an
// un-signed-out session, i.e. `active` — expiry stays derived from `expiresAt`
// and is deliberately not a status.
//
// Run this before hardening the column (docs/MIGRATION.md, "Adding a Required
// Field"): deploy the optional column + this migration, run `kitcn migrate up`
// against the target deployment, then add `.notNull()` and redeploy.
export const migration = defineMigration({
	id: "20260816_234850_backfill_session_status",
	description: "Backfill session.status to 'active' on pre-existing rows",
	up: {
		table: "session",
		migrateOne: async (_ctx, doc) => {
			if (doc.status === undefined || doc.status === null) {
				return { status: "active" };
			}
		},
	},
	down: {
		table: "session",
		migrateOne: async (_ctx, doc) => {
			// Only strip `active` — the sole value `up` ever writes. Stripping
			// every status would erase real `signed_out` / `revoked` records, and
			// since a missing status reads as active, a rollback would silently
			// REVIVE sessions an admin had terminated.
			if (doc.status === "active") {
				return { status: undefined };
			}
		},
	},
});
