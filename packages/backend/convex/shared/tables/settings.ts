import { z } from "zod";

// ─── Registration settings ───────────────────────────────────────────────────
// Global, admin-controlled signup configuration, stored as a singleton row in
// the `settings` table. The web signup form reads `requireInvitationCode` to
// decide whether to show / require the invitation field, and the backend
// `signUpWithInvitation` mutation enforces it. Shared between the backend
// procedures and both frontend apps so the shape stays in one place.

// Applied when the singleton row is absent (the table starts empty; the row is
// created lazily on the first admin toggle). `true` preserves the original
// invitation-gated behavior — registration stays closed unless an admin opens
// it from the dashboard /settings page.
export const DEFAULT_REGISTRATION_SETTINGS = {
	requireInvitationCode: true,
} as const;

export type RegistrationSettings = {
	requireInvitationCode: boolean;
};

// Input for the admin-only `settings.setRequireInvitationCode` mutation.
export const setRequireInvitationCodeInputSchema = z.object({
	requireInvitationCode: z.boolean(),
});
