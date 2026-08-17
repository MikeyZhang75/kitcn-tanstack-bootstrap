import { z } from "zod";

import { invitationCodeInputSchema } from "./invitations";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Username constraints ──────────────────────────────────────────────────
// 3–30 chars, alphanumeric + underscore. The username is the canonical login
// handle: stored lowercased (so login is case-insensitive) and unique. Shared
// between the backend auth procedures and the frontend auth form so the rules
// — and their Chinese error messages — stay in sync.

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

// Sign-in deliberately does NOT reuse `passwordSchema`: the min-length policy
// applies to *new* passwords only. An existing account whose password predates
// a future policy bump must still be able to sign in — so accept any non-empty
// string and let credential verification be the gate.
export const signInInputSchema = z.object({
	username: usernameSchema,
	password: z.string().min(1, "请输入密码"),
});

export const signUpWithInvitationInputSchema = z.object({
	username: usernameSchema,
	password: passwordSchema,
	// Optional: required only when registration is gated behind an invitation
	// code (the live `settings.requireInvitationCode` flag, default true). The
	// backend reads that flag and enforces presence + validity when on; when
	// off, the field is ignored. The web signup form shows / requires the field
	// conditionally on the same flag.
	invitationCode: invitationCodeInputSchema.optional(),
});

// ─── Password management ───────────────────────────────────────────────────
// Two paths, deliberately separate procedures with different authorization:
//   - `account.changePassword` — the signed-in user, proving the current
//     password.
//   - `users.resetPassword`    — an admin overriding someone else's, with no
//     such proof (they don't have it).
// See docs/auth.md 「密码管理」 for the session-termination semantics.
//
// ⚠️ Neither schema carries a top-level `.refine()`, and neither should. It
// would run — zod 4's `.refine()` returns the same `ZodObject`, so kitcn's
// `.shape`-based input merge is fine — but kitcn's `parseInput` throws
// `ConvexError({ ZodError })` from OUTSIDE the handler's try block, bypassing
// the error normalizer; the client's `normalizeError` then finds no
// `code`/`message` and degrades to a generic 「出现错误」 toast, breaking the
// `{ code, message, data? }` envelope. Cross-field rules go in the procedure
// body ("新密码不能与当前密码相同") or in the form ("两次输入的密码不一致").
// A schema carrying checks also can't be `.extend()`/`.omit()`/`.merge()`d
// afterwards, and this module already composes schemas across files.

// `currentPassword` deliberately does NOT reuse `passwordSchema` — same reason
// as `signInInputSchema` above: the min-length policy governs *new* passwords,
// and an account whose password predates a policy bump must still be able to
// prove it. Only `newPassword` is held to the current policy.
export const changePasswordInputSchema = z.object({
	currentPassword: z.string().min(1, "请输入当前密码"),
	newPassword: passwordSchema,
});

// The confirm-password field is UI-only and is NOT declared here: Convex
// validates procedure args strictly, so every declared field is one the client
// must transmit — declaring it would ship the new password twice over the wire
// for a check the form already did.
export const resetPasswordInputSchema = z.object({
	userId: z.string().min(1),
	newPassword: passwordSchema,
});

// ─── Admin user browser ────────────────────────────────────────────────────
// Offset pagination for the dashboard `/users` list, same shape and cap as the
// invitations list.

export const USER_LIST_PAGE_SIZE_MAX = 100;

export const listUsersInputSchema = z.object({
	page: z.number().int().nonnegative(),
	pageSize: z.number().int().min(1).max(USER_LIST_PAGE_SIZE_MAX),
});

export const getUserInputSchema = z.object({
	id: z.string().min(1),
});

// Operator-only — consumed by the internal `users.bootstrapAdmin` mutation,
// which creates the very first admin from a clean deployment (no existing
// user, no invitation). Same shape as signup minus the invitation field.
export const bootstrapAdminInputSchema = z.object({
	username: usernameSchema,
	password: passwordSchema,
});
