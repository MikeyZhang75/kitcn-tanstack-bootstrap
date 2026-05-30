import { bytesToHex } from "@noble/hashes/utils.js";

// Opaque session tokens: 256 bits of CSPRNG output rendered as 64 lowercase
// hex chars. `crypto.getRandomValues` is available + deterministically seeded
// in the Convex runtime, so token minting runs inline in mutations. The token
// is the bearer credential — stored verbatim in the `session` table and held
// by the client in localStorage; there is no JWT and nothing to verify, the
// row's existence (and `expiresAt`) is the source of truth.
const SESSION_TOKEN_BYTES = 32;

export function generateSessionToken(): string {
	const buffer = new Uint8Array(SESSION_TOKEN_BYTES);
	crypto.getRandomValues(buffer);
	return bytesToHex(buffer);
}
