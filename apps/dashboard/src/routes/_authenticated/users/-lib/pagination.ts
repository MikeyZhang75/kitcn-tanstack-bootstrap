"use client";

import type { TableProps } from "antd";
import { useCallback, useMemo, useReducer } from "react";

import {
	createInitialPagination,
	paginationReducer,
} from "../-model/pagination";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export type TablePagination = {
	/** 从 0 开始的当前页；antd 的 `current` 从 1 开始，在 toAntdPagination 里换算 */
	pageIndex: number;
	pageSize: number;
	/** 全量行数，由对应的 `count` query 提供 */
	total: number;
	/** 后端的计数扫描触顶时为 true，总数显示为「N+」 */
	capped?: boolean;
	onPageChange: (pageIndex: number) => void;
	onPageSizeChange: (pageSize: number) => void;
};

/**
 * Offset-pagination wiring shared by every table in this slice: owns the
 * reducer, clamps page jumps against the known total, and only produces the
 * `TablePagination` object once `total` has arrived (before that the table
 * renders with its pager hidden rather than guessing a page count).
 */
export function useOffsetPagination(
	defaultPageSize: number,
	total: number | undefined,
	capped?: boolean,
) {
	const [state, dispatch] = useReducer(
		paginationReducer,
		defaultPageSize,
		createInitialPagination,
	);
	const { pageSize } = state;

	const maxIndex =
		total != null ? Math.max(0, Math.ceil(total / pageSize) - 1) : null;

	// Clamp on read rather than storing the clamped value. Revoking sessions
	// doesn't delete rows, but a user's total can still move under an admin who
	// is sitting on the last page (new sign-ins, another admin acting), and
	// deriving it keeps the reducer pure and StrictMode-safe. The admin lands
	// back on their page if the total grows again.
	const pageIndex =
		maxIndex != null ? Math.min(state.pageIndex, maxIndex) : state.pageIndex;

	const onPageChange = useCallback(
		(target: number) => {
			if (target < 0) return;
			if (maxIndex != null && target > maxIndex) return;
			dispatch({ type: "change_page", pageIndex: target });
		},
		[maxIndex],
	);

	const onPageSizeChange = useCallback(
		(size: number) => dispatch({ type: "change_page_size", pageSize: size }),
		[],
	);

	const paginationProps: TablePagination | undefined = useMemo(
		() =>
			total != null
				? {
						pageIndex,
						pageSize,
						total,
						capped,
						onPageChange,
						onPageSizeChange,
					}
				: undefined,
		[total, capped, pageIndex, pageSize, onPageChange, onPageSizeChange],
	);

	return { pageIndex, pageSize, paginationProps };
}

/**
 * Map our 0-based pagination onto antd's 1-based pager. `false` (no pager) is
 * the honest rendering while the total is still unknown.
 */
export function toAntdPagination(
	pagination: TablePagination | undefined,
): TableProps["pagination"] {
	if (!pagination) return false;
	return {
		current: pagination.pageIndex + 1,
		// antd 在改页长时也会触发 onChange，所以先判断页长有没有变：变了就走
		// onPageSizeChange（reducer 会顺带把页码归零），没变才是单纯翻页。
		onChange: (page, size) => {
			if (size !== pagination.pageSize) {
				pagination.onPageSizeChange(size);
				return;
			}
			pagination.onPageChange(page - 1);
		},
		pageSize: pagination.pageSize,
		pageSizeOptions: PAGE_SIZE_OPTIONS,
		showSizeChanger: true,
		showTotal: (total: number) =>
			pagination.capped ? `共 ${total}+ 条` : `共 ${total} 条`,
		total: pagination.total,
	};
}
