import { z } from "zod";

import { invitationCodeInputSchema } from "./invitations";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Username constraints ──────────────────────────────────────────────────
// Mirrors the Better Auth username plugin's own validator (3–30 chars,
// alphanumeric + underscore). Shared between the backend signup procedure
// and the frontend auth form so the rules — and their Chinese error
// messages — stay in sync. The plugin re-validates and normalizes to
// lowercase server-side during signUpEmail.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
// Pattern source without ^/$ anchors so it can be reused as an HTML
// `pattern` attribute (which implicitly anchors). The Zod schema below
// anchors explicitly since `regex.test(...)` does not.
export const USERNAME_PATTERN = "[a-zA-Z0-9_]+";

export const usernameSchema = z
	.string()
	.min(USERNAME_MIN_LENGTH, `用户名至少 ${USERNAME_MIN_LENGTH} 个字符`)
	.max(USERNAME_MAX_LENGTH, `用户名最多 ${USERNAME_MAX_LENGTH} 个字符`)
	.regex(
		new RegExp(`^${USERNAME_PATTERN}$`),
		"用户名只能包含字母、数字和下划线",
	);

// ─── Password constraints ──────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `密码至少 ${PASSWORD_MIN_LENGTH} 位`);

// ─── Procedure input schemas ───────────────────────────────────────────────
// Single source of truth for each procedure's `.input()`. The backend
// procedure and the frontend form must consume the same schema — never
// re-derive or duplicate. See CLAUDE.md "One source of truth".
// The invitation-code validator is canonically defined alongside the
// invitations table (`invitationCodeInputSchema`) and shared with the admin
// create flow — same length / charset guarantees on both ends.

export const signUpWithInvitationInputSchema = z.object({
	username: usernameSchema,
	password: passwordSchema,
	invitationCode: invitationCodeInputSchema,
});

// Operator-only — consumed by the internal `users.bootstrapAdmin` mutation,
// which creates the very first admin from a clean deployment (no existing
// user, no invitation). Same shape as signup minus the invitation field.
export const bootstrapAdminInputSchema = z.object({
	username: usernameSchema,
	password: passwordSchema,
});
