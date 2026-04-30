"use client";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
	component: DashboardPage,
});

function DashboardPage() {
	return (
		<div className="flex flex-col gap-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">仪表盘</h1>
				<p className="text-muted-foreground text-sm">管理后台。</p>
			</header>
		</div>
	);
}
