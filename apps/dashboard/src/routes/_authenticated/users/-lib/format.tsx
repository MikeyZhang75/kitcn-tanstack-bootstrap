import { Tooltip, Typography } from "antd";
import type { ReactNode } from "react";

export const dateFormat = new Intl.DateTimeFormat("zh-CN", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

/** 可空时间列的统一渲染：没有值就画横杠。 */
export function renderDateTime(value: Date | null): ReactNode {
	return (
		<Typography.Text type="secondary">
			{value ? dateFormat.format(value) : "—"}
		</Typography.Text>
	);
}

/**
 * User-Agent 单元格：原样存、原样显示，超长用 ellipsis 截断，Tooltip 给全文。
 *
 * 刻意不引入 UA 解析库 —— 审计时想看的就是原始串，解析结果反而丢信息。
 */
export function renderUserAgent(value: string | null): ReactNode {
	if (!value) {
		return <Typography.Text type="secondary">—</Typography.Text>;
	}
	return (
		<Tooltip title={value}>
			<Typography.Text
				ellipsis
				style={{ display: "block", maxWidth: 280 }}
				type="secondary"
			>
				{value}
			</Typography.Text>
		</Tooltip>
	);
}

/**
 * IP 单元格。⚠️ 这个值来自 `x-forwarded-for` 最左项，可被客户端伪造，只能当
 * 审计线索——不要据此做封禁/鉴权判断（详见 backend shared/tables/session.ts）。
 */
export function renderIpAddress(value: string | null): ReactNode {
	return (
		<Typography.Text type={value ? undefined : "secondary"}>
			{value ?? "—"}
		</Typography.Text>
	);
}
