import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";

type LoadingButtonProps = React.ComponentProps<typeof Button> & {
	loading?: boolean;
	loadingText?: React.ReactNode;
};

function LoadingButton({
	loading = false,
	loadingText,
	disabled,
	children,
	...props
}: LoadingButtonProps) {
	return (
		<Button disabled={disabled || loading} {...props}>
			{loading ? (
				<>
					<Spinner data-icon="inline-start" />
					{loadingText ?? children}
				</>
			) : (
				children
			)}
		</Button>
	);
}

export { LoadingButton };
export type { LoadingButtonProps };
