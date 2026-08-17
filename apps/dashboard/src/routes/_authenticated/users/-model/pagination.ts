// Offset-pagination state, shared by the users list and the per-user session
// list under `$userId/`. Same shape and same invariant as the invitations
// slice's reducer.

export type PaginationState = {
	pageSize: number;
	pageIndex: number;
};

export type PaginationAction =
	| { type: "change_page_size"; pageSize: number }
	| { type: "change_page"; pageIndex: number };

export function createInitialPagination(
	defaultPageSize: number,
): PaginationState {
	return {
		pageSize: defaultPageSize,
		pageIndex: 0,
	};
}

export function paginationReducer(
	state: PaginationState,
	action: PaginationAction,
): PaginationState {
	switch (action.type) {
		case "change_page_size": {
			// Changing pageSize re-buckets rows — offset N belongs to a different
			// page now, so reset to page 0.
			if (action.pageSize === state.pageSize) return state;
			return { pageSize: action.pageSize, pageIndex: 0 };
		}
		case "change_page": {
			if (action.pageIndex === state.pageIndex) return state;
			return { ...state, pageIndex: action.pageIndex };
		}
	}
}
