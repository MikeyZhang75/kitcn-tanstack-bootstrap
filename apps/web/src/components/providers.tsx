import { AppConvexProvider } from "@repo/app-convex/convex-provider";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";

// `ConfigProvider` 提供 antd 的中文文案（Table 分页、Modal 按钮、Empty 等）与
// 主题 token；`App` 提供 message / notification / modal 的上下文实例 —— 组件里
// 一律用 `App.useApp()` 取 `message`，不要 import antd 的静态 `message`（静态
// 方法拿不到 ConfigProvider 的主题和 locale）。
export function Providers({ children }: { children: ReactNode }) {
	return (
		<ConfigProvider locale={zhCN}>
			<AntdApp>
				<AppConvexProvider>{children}</AppConvexProvider>
			</AntdApp>
		</ConfigProvider>
	);
}
