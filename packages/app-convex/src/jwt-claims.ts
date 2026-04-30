import { isEnumMember } from "@repo/backend/shared/enum-guard";
import { USER_ROLES, type UserRole } from "@repo/backend/shared/tables/user";

export type SessionClaims = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	role: UserRole;
	expiresAt: number;
};

type JwtPayload = {
	sub?: unknown;
	name?: unknown;
	email?: unknown;
	emailVerified?: unknown;
	role?: unknown;
	exp?: unknown;
};

/**
 * Decode a JWT's payload without verifying its signature.
 *
 * Safe for UI-only use (gating what renders) because the backend revalidates
 * the token on every request — a tampered client-side token can fool the UI
 * but not the data layer.
 */
export function decodeJwtPayload(token: string): JwtPayload | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
		const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
		const json = new TextDecoder().decode(bytes);
		return JSON.parse(json) as JwtPayload;
	} catch {
		return null;
	}
}

/** Turn a decoded JWT payload into our strongly-typed session claims. */
export function normalizeClaims(
	payload: JwtPayload | null,
): SessionClaims | null {
	if (!payload) return null;

	if (!isEnumMember(USER_ROLES, payload.role)) return null;

	return {
		id: typeof payload.sub === "string" ? payload.sub : "",
		name: typeof payload.name === "string" ? payload.name : "",
		email: typeof payload.email === "string" ? payload.email : "",
		emailVerified: payload.emailVerified === true,
		role: payload.role,
		expiresAt: typeof payload.exp === "number" ? payload.exp : 0,
	};
}

export function claimsFromToken(
	token: string | null | undefined,
): SessionClaims | null {
	if (!token) return null;
	return normalizeClaims(decodeJwtPayload(token));
}
