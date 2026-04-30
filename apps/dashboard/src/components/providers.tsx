import { AppConvexProvider } from "@repo/app-convex/convex-provider";
import { Toaster } from "@repo/ui/components/sonner";
import {
	CircleCheckIcon,
	InfoIcon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { authClient } from "@/lib/convex/auth-client";

export function Providers({ children }: { children: ReactNode }) {
	return (
		<AppConvexProvider authClient={authClient}>
			{children}
			<Toaster
				position="top-center"
				icons={{
					success: <CircleCheckIcon className="size-4 text-emerald-500" />,
					info: <InfoIcon className="size-4 text-blue-500" />,
					warning: <TriangleAlertIcon className="size-4 text-amber-500" />,
					error: <OctagonXIcon className="size-4 text-red-500" />,
				}}
			/>
		</AppConvexProvider>
	);
}
