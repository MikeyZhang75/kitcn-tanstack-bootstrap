import type { Value } from "convex/values";
import { CRPCError, type CRPCErrorCode } from "kitcn/server";

/**
 * Success envelope for every non-private procedure. Matches the error shape
 * `{ code, message, data? }` so clients can consume both branches uniformly.
 *
 * Handlers should `return ok(payload)` for successful responses and
 * `throw error(...)` for failures.
 */

// ---------- success ----------

export type CRPCSuccess<TData = undefined> = TData extends undefined
	? { code: "OK"; message: string }
	: { code: "OK"; message: string; data: TData };

export function ok(message?: string): CRPCSuccess;
export function ok<TData>(data: TData, message?: string): CRPCSuccess<TData>;
export function ok<TData>(
	dataOrMessage?: TData | string,
	maybeMessage?: string,
): CRPCSuccess | CRPCSuccess<TData> {
	if (typeof dataOrMessage === "string" || dataOrMessage === undefined) {
		return {
			code: "OK",
			message: dataOrMessage ?? "成功",
		} as CRPCSuccess;
	}
	return {
		code: "OK",
		message: maybeMessage ?? "成功",
		data: dataOrMessage,
	} as CRPCSuccess<TData>;
}

// ---------- error ----------

export type CRPCErrorData = Record<string, Value | undefined>;

/**
 * Build a CRPCError whose wire shape is `{ code, message, data? }`.
 * Any extra payload is nested under the `data` key so it mirrors `ok()`.
 *
 * @example
 *   throw error("BAD_REQUEST", "Invalid invitation code");
 *   throw error("BAD_REQUEST", "Invalid invitation code", { field: "invitationCode" });
 */

export function error(
	code: CRPCErrorCode,
	message: string,
	data?: CRPCErrorData,
	// oxlint-disable-next-line typescript/no-explicit-any -- CRPCError's TData generic is invariant and must be `any` to be throwable across call sites.
): CRPCError<any> {
	return new CRPCError<{ data: CRPCErrorData }>({
		code,
		message,
		...(data !== undefined ? { data: { data } } : {}),
	});
}
