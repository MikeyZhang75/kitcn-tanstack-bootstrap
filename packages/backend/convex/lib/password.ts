import { scrypt } from "@noble/hashes/scrypt.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

// Password hashing for our own credential store (no Better Auth). scrypt is
// pure JS (`@noble/hashes`), so it runs inside the Convex V8 isolate with no
// native bindings, and the salt comes from `crypto.getRandomValues` — both
// available + deterministically seeded in the Convex runtime, so hashing runs
// inline in the signUp / signIn / bootstrapAdmin mutations (no action hop).
//
// N is the CPU/memory work factor (power of two); memory ≈ 128 * N * r bytes,
// so N=2^14, r=8 ≈ 16 MiB per hash — a deliberate balance between brute-force
// resistance and staying well within Convex's per-mutation budget. Raise N as
// hardware allows: the parameters are encoded into every stored hash, so old
// hashes keep verifying after the constants change.
const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DK_LEN = 32;
const SALT_BYTES = 16;

// Self-describing PHC-style encoding: `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>`.
// `verifyPassword` reads the parameters back from the stored string instead of
// the constants above, so changing the constants only affects new hashes.
const SCHEME = "scrypt";

function randomHex(byteLength: number): string {
	const buffer = new Uint8Array(byteLength);
	crypto.getRandomValues(buffer);
	return bytesToHex(buffer);
}

function deriveKey(
	plain: string,
	salt: Uint8Array,
	opts: { N: number; r: number; p: number; dkLen: number },
): Uint8Array {
	return scrypt(utf8ToBytes(plain), salt, opts);
}

export function hashPassword(plain: string): string {
	const saltHex = randomHex(SALT_BYTES);
	const derived = deriveKey(plain, hexToBytes(saltHex), {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
		dkLen: DK_LEN,
	});
	return [
		SCHEME,
		SCRYPT_N,
		SCRYPT_R,
		SCRYPT_P,
		saltHex,
		bytesToHex(derived),
	].join("$");
}

export function verifyPassword(plain: string, stored: string): boolean {
	const parts = stored.split("$");
	if (parts.length !== 6 || parts[0] !== SCHEME) return false;

	const N = Number(parts[1]);
	const r = Number(parts[2]);
	const p = Number(parts[3]);
	if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
		return false;
	}

	let salt: Uint8Array;
	let expected: Uint8Array;
	try {
		salt = hexToBytes(parts[4]);
		expected = hexToBytes(parts[5]);
	} catch {
		return false;
	}

	const derived = deriveKey(plain, salt, { N, r, p, dkLen: expected.length });
	return timingSafeEqual(derived, expected);
}

// Constant-time comparison — never short-circuit on the first mismatching byte,
// so an attacker can't infer how much of a guessed hash is correct from timing.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}
