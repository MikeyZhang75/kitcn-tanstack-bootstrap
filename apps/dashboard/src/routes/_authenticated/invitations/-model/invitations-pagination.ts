export type InvitationsPaginationState = {
	pageSize: number;
	pageIndex: number;
};

export type InvitationsPaginationAction =
	| { type: "change_page_size"; pageSize: number }
	| { type: "change_page"; pageIndex: number };

export function createInitialInvitationsPagination(
	defaultPageSize: number,
): InvitationsPaginationState {
	return {
		pageSize: defaultPageSize,
		pageIndex: 0,
	};
}

export function invitationsPaginationReducer(
	state: InvitationsPaginationState,
	action: InvitationsPaginationAction,
): InvitationsPaginationState {
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
