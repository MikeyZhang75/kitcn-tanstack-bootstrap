import { createRouter } from "@tanstack/react-router";
import { Flex, Result } from "antd";

import { routeTree } from "./routeTree.gen";

function DefaultNotFound() {
	return (
		<Flex align="center" justify="center" style={{ minHeight: "100dvh" }}>
			<Result status="404" subTitle="页面未找到" title="404" />
		</Flex>
	);
}

export function getRouter() {
	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultNotFoundComponent: DefaultNotFound,
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
