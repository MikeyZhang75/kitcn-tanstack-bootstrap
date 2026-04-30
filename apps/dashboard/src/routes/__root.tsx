import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { Providers } from "@/components/providers";

import appCss from "../styles.css?url";

if (typeof window !== "undefined") {
	window.addEventListener("vite:preloadError", () => {
		const KEY = "vite-preload-reloaded";
		if (sessionStorage.getItem(KEY)) return;
		sessionStorage.setItem(KEY, "1");
		window.location.reload();
	});
	window.addEventListener("load", () => {
		sessionStorage.removeItem("vite-preload-reloaded");
	});
}

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "管理后台",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	component: RootComponent,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="zh-CN">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				{import.meta.env.DEV && (
					<TanStackDevtools
						config={{
							position: "bottom-right",
						}}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
						]}
					/>
				)}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	return (
		<Providers>
			<Outlet />
		</Providers>
	);
}
