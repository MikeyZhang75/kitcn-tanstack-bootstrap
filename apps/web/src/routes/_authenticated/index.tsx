"use client";

import { createFileRoute } from "@tanstack/react-router";
import { Flex, Typography } from "antd";

export const Route = createFileRoute("/_authenticated/")({
	component: DashboardPage,
});

function DashboardPage() {
	return (
		<Flex gap={24} vertical>
			<div>
				<Typography.Title level={3} style={{ marginBlock: "0 4px" }}>
					仪表盘
				</Typography.Title>
				<Typography.Text type="secondary">欢迎回来。</Typography.Text>
			</div>
		</Flex>
	);
}
