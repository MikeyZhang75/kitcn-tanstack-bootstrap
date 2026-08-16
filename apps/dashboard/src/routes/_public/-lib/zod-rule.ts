import type { FormRule } from "antd";
import type { ZodType } from "zod";

/**
 * 把 `@repo/backend/shared/...` 里的 zod schema 直接接到 antd Form 的校验链上。
 *
 * 目的是守住 CLAUDE.md 的「One source of truth」：长度、字符集这些约束以及它们
 * 的中文报错文案只在后端 schema 里声明一次，前端表单不再复述一遍 `min` /
 * `pattern` / `message`。
 *
 * 只适用于字符串字段：未填时 antd 给的是 `undefined`，这里统一收敛成空串再交给
 * schema，好让「必填」也走 schema 自带的中文文案（例如「用户名至少 3 个字符」），
 * 而不是 antd 的通用 required 模板。
 */
export function zodStringRule(schema: ZodType): FormRule {
	return {
		validator: (_rule, value: unknown) => {
			const result = schema.safeParse(value ?? "");
			if (result.success) return Promise.resolve();
			return Promise.reject(new Error(result.error.issues[0]?.message));
		},
	};
}
