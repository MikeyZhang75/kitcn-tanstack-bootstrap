import { ConvexError } from "convex/values";

export type NormalizedError = {
	code: string;
	message: string;
	data?: Record<string, unknown>;
};

const DEFAULT_CODE = "UNKNOWN_ERROR";
const DEFAULT_MESSAGE = "出现错误";

export function normalizeError(error: unknown): NormalizedError | null {
	if (error == null) return null;

	if (error instanceof ConvexError) {
		const payload = error.data;

		if (typeof payload === "string") {
			return { code: DEFAULT_CODE, message: payload };
		}

		if (payload && typeof payload === "object") {
			const { code, message, data } = payload as Record<string, unknown>;
			return {
				code: typeof code === "string" ? code : DEFAULT_CODE,
				message: typeof message === "string" ? message : DEFAULT_MESSAGE,
				...(data && typeof data === "object"
					? { data: data as Record<string, unknown> }
					: {}),
			};
		}
	}

	if (error instanceof Error) {
		return { code: DEFAULT_CODE, message: error.message };
	}

	// Better Auth's BetterFetchError arrives as a plain object (not an Error
	// instance), so `authClient.signIn.username` errors would otherwise fall
	// through to `null` and surface as the generic "出现错误" toast.
	if (typeof error === "object" && "message" in error) {
		const { code, message } = error as {
			code?: unknown;
			message?: unknown;
		};
		return {
			code: typeof code === "string" ? code : DEFAULT_CODE,
			message: typeof message === "string" ? message : DEFAULT_MESSAGE,
		};
	}

	return null;
}

export function extractErrorMessage(error: unknown): string | null {
	return normalizeError(error)?.message ?? null;
}
