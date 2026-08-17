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

/**
 * 「本字段必须等于另一个字段」的校验，用于确认密码这类二次输入。
 *
 * `zodStringRule` 表达不了跨字段比较 —— 它只吃一个 `ZodType` 和一个值，所以这里
 * 用 antd 的函数式规则（`RuleRender`）拿到 form 实例。别忘了在 `Form.Item` 上配
 * `dependencies={[otherField]}`，否则先填确认框、再改原字段时不会重新校验。
 *
 * 文案留在前端是对的：确认字段从不发给后端，没有任何 canonical schema 声明它。
 * 空值不报错，交给该字段自己的 `zodStringRule` 去说「必填」。
 */
export function matchesFieldRule(
	otherField: string,
	message: string,
): FormRule {
	return ({ getFieldValue }) => ({
		validator: (_rule, value: unknown) =>
			!value || getFieldValue(otherField) === value
				? Promise.resolve()
				: Promise.reject(new Error(message)),
	});
}
