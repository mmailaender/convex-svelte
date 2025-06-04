import { useQuery } from './client.svelte.js';
import type {
	FunctionReference,
	FunctionArgs,
	FunctionReturnType,
	Cursor,
	PaginationOptions,
	PaginationResult
} from 'convex/server';

// Type definitions for paginated queries
export type PaginatedQueryReference = FunctionReference<
	'query',
	'public',
	{ paginationOpts: PaginationOptions },
	PaginationResult<any>
>;

export type PaginatedQueryArgs<Query extends PaginatedQueryReference> = Omit<
	FunctionArgs<Query>,
	'paginationOpts'
>;

export type PaginatedQueryItem<Query extends PaginatedQueryReference> =
	FunctionReturnType<Query>['page'][number];

export type UsePaginatedQueryResult<Item> = {
	results: Item[];
	loadMore: (numItems: number) => void;
} & (
	| {
			status: 'LoadingFirstPage';
			isLoading: true;
	  }
	| {
			status: 'CanLoadMore';
			isLoading: false;
	  }
	| {
			status: 'LoadingMore';
			isLoading: true;
	  }
	| {
			status: 'Exhausted';
			isLoading: false;
	  }
);

export type UsePaginatedQueryReturnType<Query extends PaginatedQueryReference> =
	UsePaginatedQueryResult<PaginatedQueryItem<Query>>;

interface PaginatedQueryOptions {
	initialNumItems: number;
}

/**
 * Subscribe to a paginated Convex query and return a reactive result object with pagination support.
 *
 * @param query - a FunctionReference for a paginated query like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function (excluding paginationOpts).
 * @param options - Options including initialNumItems.
 * @returns an object containing results, loadMore function, status, and isLoading.
 */
export function usePaginatedQuery<Query extends PaginatedQueryReference>(
	query: Query,
	args:
		| PaginatedQueryArgs<Query>
		| (() => PaginatedQueryArgs<Query>) = {} as PaginatedQueryArgs<Query>,
	options: PaginatedQueryOptions | (() => PaginatedQueryOptions)
): UsePaginatedQueryReturnType<Query> {
	// Parse options
	const parsedOptions = typeof options === 'function' ? options() : options;

	// State to track pagination
	const state = $state({
		pages: [] as Array<{
			cursor: Cursor | null;
			numItems: number;
			result: FunctionReturnType<Query> | undefined;
		}>,
		isLoadingMore: false
	});

	// Initialize with first page
	$effect(() => {
		if (state.pages.length === 0) {
			state.pages = [
				{
					cursor: null,
					numItems: parsedOptions.initialNumItems,
					result: undefined
				}
			];
		}
	});

	// Create queries for each page
	const queries = $derived.by(() => {
		return state.pages.map((page, index) => {
			const parsedArgs = typeof args === 'function' ? args() : args;
			const queryArgs = {
				...parsedArgs,
				paginationOpts: {
					numItems: page.numItems,
					cursor: page.cursor
				}
			} as FunctionArgs<Query>;

			// We need to create a reactive query for each page
			// Since we can't call useQuery conditionally, we'll return the query config
			return {
				args: queryArgs,
				index
			};
		});
	});

	// Execute queries and update state
	queries.forEach((queryConfig, index) => {
		const queryResult = useQuery(query, queryConfig.args);

		$effect(() => {
			if (queryResult.data && state.pages[index]) {
				state.pages[index].result = queryResult.data;
			}
		});
	});

	// Combine results from all pages
	const combinedResults = $derived.by(() => {
		const allResults: PaginatedQueryItem<Query>[] = [];

		for (const page of state.pages) {
			if (page.result?.page) {
				allResults.push(...page.result.page);
			}
		}

		return allResults;
	});

	// Determine status
	const status = $derived.by(() => {
		if (state.pages.length === 0) {
			return 'LoadingFirstPage' as const;
		}

		const firstPage = state.pages[0];
		if (!firstPage.result) {
			return 'LoadingFirstPage' as const;
		}

		if (state.isLoadingMore) {
			return 'LoadingMore' as const;
		}

		const lastPage = state.pages[state.pages.length - 1];
		if (lastPage.result?.isDone) {
			return 'Exhausted' as const;
		}

		return 'CanLoadMore' as const;
	});

	// Load more function
	const loadMore = (numItems: number) => {
		if (status !== 'CanLoadMore') {
			return;
		}

		const lastPage = state.pages[state.pages.length - 1];
		if (!lastPage.result) {
			return;
		}

		state.isLoadingMore = true;

		// Add new page with the continue cursor from the last page
		state.pages.push({
			cursor: lastPage.result.continueCursor,
			numItems,
			result: undefined
		});

		// Reset loading state after a short delay (will be updated by the actual query)
		setTimeout(() => {
			state.isLoadingMore = false;
		}, 0);
	};

	const isLoading = $derived(status === 'LoadingFirstPage' || status === 'LoadingMore');

	return {
		get results() {
			return combinedResults;
		},
		get status() {
			return status;
		},
		get isLoading() {
			return isLoading;
		},
		loadMore
	} as UsePaginatedQueryReturnType<Query>;
}
