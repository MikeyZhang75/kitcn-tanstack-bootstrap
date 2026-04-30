"use client";

import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@repo/ui/components/pagination";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;
const SIBLING_COUNT = 1;
const BOUNDARY_COUNT = 1;
// Fixed item count (7) — keeps the pager a stable width so navigation doesn't
// reflow the row. Derived from: 2 boundary + 2 sibling + current + 2 fillers.
const TOTAL_SLOTS = BOUNDARY_COUNT * 2 + SIBLING_COUNT * 2 + 3;

export interface DataTablePagination {
	/** Zero-based current page index */
	pageIndex: number;
	/** When true, buttons are disabled (e.g. a fetch is in flight) */
	isFetching?: boolean;
	/** Called with the next zero-based page index */
	onPageChange: (pageIndex: number) => void;
	/** Current page size */
	pageSize: number;
	/** Selectable page size options (defaults to 5 / 10 / 20 / 50) */
	pageSizeOptions?: readonly number[];
	onPageSizeChange: (size: number) => void;
	/** Total row count across all pages — required to render numbered pages. */
	total: number;
}

type PageSlot = number | "ellipsis-start" | "ellipsis-end";

// MUI-style page range with constant slot count. Near the edges the sibling
// window is extended outward so the total item count stays fixed — this is
// what prevents the pager from reflowing as the user navigates page-by-page.
function getPageRange(currentPage: number, pageCount: number): PageSlot[] {
	if (pageCount <= TOTAL_SLOTS) {
		return Array.from({ length: pageCount }, (_, i) => i + 1);
	}

	// Extend the sibling window at edges to keep total slots constant.
	const siblingsStart = Math.max(
		Math.min(
			currentPage - SIBLING_COUNT,
			pageCount - BOUNDARY_COUNT - SIBLING_COUNT * 2 - 1,
		),
		BOUNDARY_COUNT + 2,
	);
	const siblingsEnd = Math.min(
		Math.max(
			currentPage + SIBLING_COUNT,
			BOUNDARY_COUNT + SIBLING_COUNT * 2 + 2,
		),
		pageCount - BOUNDARY_COUNT - 1,
	);

	const range: PageSlot[] = [];
	for (let i = 1; i <= BOUNDARY_COUNT; i++) range.push(i);

	if (siblingsStart > BOUNDARY_COUNT + 2) {
		range.push("ellipsis-start");
	} else if (BOUNDARY_COUNT + 1 < siblingsStart) {
		range.push(BOUNDARY_COUNT + 1);
	}

	for (let i = siblingsStart; i <= siblingsEnd; i++) range.push(i);

	if (siblingsEnd < pageCount - BOUNDARY_COUNT - 1) {
		range.push("ellipsis-end");
	} else if (pageCount - BOUNDARY_COUNT > siblingsEnd) {
		range.push(pageCount - BOUNDARY_COUNT);
	}

	for (let i = pageCount - BOUNDARY_COUNT + 1; i <= pageCount; i++) {
		range.push(i);
	}
	return range;
}

interface DataTableProps<TData> {
	data: TData[];
	// oxlint-disable-next-line typescript/no-explicit-any -- TanStack Table's ColumnDef requires `any` as the second generic for mixed-type column definitions
	columns: ColumnDef<TData, any>[];
	/** Extra className on the `<TableBody>` (e.g. max-height scroll) */
	bodyClassName?: string;
	/** Extra className on the outer flex-col container (e.g. `min-w-0`) */
	containerClassName?: string;
	/** Text shown when the table has no rows */
	emptyText?: string;
	/** Optional numbered pager rendered below the bordered table */
	pagination?: DataTablePagination;
}

export function DataTable<TData>({
	data,
	columns,
	bodyClassName,
	containerClassName,
	emptyText = "暂无数据",
	pagination,
}: DataTableProps<TData>) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	const outerClassName = ["flex flex-col gap-3", containerClassName ?? ""]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={outerClassName}>
			<div className="overflow-x-auto rounded-md border">
				<Table className="grid">
					<TableHeader className="bg-muted grid [&_tr]:border-b">
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								className="hover:bg-muted flex w-full"
								key={headerGroup.id}
							>
								{headerGroup.headers.map((header) => {
									const size = header.column.columnDef.size;
									return (
										<TableHead
											className="flex h-10 min-w-0 items-center"
											key={header.id}
											style={
												size
													? { width: `${size}px`, flexShrink: 0 }
													: { flex: 1 }
											}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody className={bodyClassName ?? "grid"}>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow className="flex w-full" key={row.id}>
									{row.getVisibleCells().map((cell) => {
										const size = cell.column.columnDef.size;
										return (
											<TableCell
												className="flex min-w-0 items-center"
												key={cell.id}
												style={
													size
														? { width: `${size}px`, flexShrink: 0 }
														: { flex: 1 }
												}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										);
									})}
								</TableRow>
							))
						) : (
							<TableRow className="flex w-full">
								<TableCell className="text-muted-foreground flex h-24 flex-1 items-center justify-center">
									{emptyText}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{pagination ? <DataTablePager pagination={pagination} /> : null}
		</div>
	);
}

function DataTablePager({ pagination }: { pagination: DataTablePagination }) {
	const pageCount = Math.max(
		1,
		Math.ceil(pagination.total / pagination.pageSize),
	);
	const currentPage = Math.min(pagination.pageIndex + 1, pageCount);
	const canPrev = currentPage > 1 && !pagination.isFetching;
	const canNext = currentPage < pageCount && !pagination.isFetching;

	const goTo = (nextPage: number) => {
		if (pagination.isFetching) return;
		const clamped = Math.max(1, Math.min(nextPage, pageCount));
		if (clamped === currentPage) return;
		pagination.onPageChange(clamped - 1);
	};

	const range = getPageRange(currentPage, pageCount);
	const sizeOptions = pagination.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-2">
				<span className="text-muted-foreground text-sm">每页</span>
				<Select
					items={sizeOptions.map((size) => ({
						label: String(size),
						value: size,
					}))}
					onValueChange={(value) => {
						if (typeof value === "number" && value !== pagination.pageSize) {
							pagination.onPageSizeChange(value);
						}
					}}
					value={pagination.pageSize}
				>
					<SelectTrigger className="h-8 w-[72px]" size="sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{sizeOptions.map((size) => (
								<SelectItem key={size} value={size}>
									{size}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<span className="text-muted-foreground text-sm">条</span>
				<span className="text-muted-foreground ml-2 text-sm tabular-nums">
					共 {pagination.total} 条
				</span>
			</div>

			<Pagination className="mx-0 w-auto justify-end">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							aria-disabled={!canPrev}
							className={cn(!canPrev && "pointer-events-none opacity-50")}
							onClick={(event) => {
								event.preventDefault();
								goTo(currentPage - 1);
							}}
							tabIndex={canPrev ? 0 : -1}
							text="上一页"
						/>
					</PaginationItem>

					<PaginationItem className="text-muted-foreground flex items-center px-2 text-sm tabular-nums sm:hidden">
						第 {currentPage} / {pageCount} 页
					</PaginationItem>

					{range.map((slot, index) => {
						if (slot === "ellipsis-start" || slot === "ellipsis-end") {
							return (
								<PaginationItem
									className="hidden sm:flex"
									key={`${slot}-${index}`}
								>
									<PaginationEllipsis />
								</PaginationItem>
							);
						}
						const isActive = slot === currentPage;
						return (
							<PaginationItem className="hidden sm:flex" key={slot}>
								<PaginationLink
									aria-label={`转到第 ${slot} 页`}
									className={cn(
										pagination.isFetching && "pointer-events-none opacity-50",
									)}
									isActive={isActive}
									onClick={(event) => {
										event.preventDefault();
										goTo(slot);
									}}
								>
									{slot}
								</PaginationLink>
							</PaginationItem>
						);
					})}

					<PaginationItem>
						<PaginationNext
							aria-disabled={!canNext}
							className={cn(!canNext && "pointer-events-none opacity-50")}
							onClick={(event) => {
								event.preventDefault();
								goTo(currentPage + 1);
							}}
							tabIndex={canNext ? 0 : -1}
							text="下一页"
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}
