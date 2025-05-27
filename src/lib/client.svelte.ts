import { getContext, setContext } from 'svelte';
import { ConvexClient, type ConvexClientOptions } from 'convex/browser';
import {
	type FunctionReference,
	type FunctionArgs,
	type FunctionReturnType,
	getFunctionName
} from 'convex/server';
import { convexToJson, type Value } from 'convex/values';
import { BROWSER } from 'esm-env';

const _contextKey = '$$_convexClient';
const _storeContextKey = '$$_convexStore';

// Global query cache entry
type QueryCacheEntry<Query extends FunctionReference<'query'>> = {
	data: FunctionReturnType<Query> | undefined;
	error: Error | undefined;
	isLoading: boolean;
	isStale: boolean;
	subscribers: Set<() => void>;
	unsubscribe: (() => void) | null;
	lastResult: FunctionReturnType<Query> | Error | undefined;
	argsForLastResult: FunctionArgs<Query> | undefined;
};

// Global store for managing query cache
class ConvexQueryStore {
	private cache = new Map<string, QueryCacheEntry<any>>();
	private client: ConvexClient;

	constructor(client: ConvexClient) {
		this.client = client;
	}

	private generateCacheKey<Query extends FunctionReference<'query'>>(
		query: Query,
		args: FunctionArgs<Query>
	): string {
		const functionName = getFunctionName(query);
		const argsJson = JSON.stringify(convexToJson(args));
		return `${functionName}:${argsJson}`;
	}

	private createCacheEntry<Query extends FunctionReference<'query'>>(
		query: Query,
		args: FunctionArgs<Query>,
		initialData?: FunctionReturnType<Query>
	): QueryCacheEntry<Query> {
		const entry: QueryCacheEntry<Query> = {
			data: initialData,
			error: undefined,
			isLoading: initialData === undefined,
			isStale: false,
			subscribers: new Set(),
			unsubscribe: null,
			lastResult: initialData,
			argsForLastResult: initialData ? args : undefined
		};

		// Only set up subscription to Convex if we're in the browser
		if (BROWSER && !this.client.disabled) {
			const unsubscribe = this.client.onUpdate(
				query,
				args,
				(dataFromServer) => {
					const copy = structuredClone(dataFromServer);
					entry.data = copy;
					entry.error = undefined;
					entry.isLoading = false;
					entry.isStale = false;
					entry.lastResult = copy;
					entry.argsForLastResult = args;
					this.notifySubscribers(entry);
				},
				(error: Error) => {
					const copy = structuredClone(error);
					entry.data = undefined;
					entry.error = copy;
					entry.isLoading = false;
					entry.isStale = false;
					entry.lastResult = copy;
					entry.argsForLastResult = args;
					this.notifySubscribers(entry);
				}
			);
			entry.unsubscribe = unsubscribe;
		}

		return entry;
	}

	private notifySubscribers<Query extends FunctionReference<'query'>>(
		entry: QueryCacheEntry<Query>
	): void {
		entry.subscribers.forEach(callback => callback());
	}

	subscribe<Query extends FunctionReference<'query'>>(
		query: Query,
		args: FunctionArgs<Query>,
		callback: () => void,
		options: UseQueryOptions<Query> = {}
	): {
		entry: QueryCacheEntry<Query>;
		unsubscribe: () => void;
	} {
		const cacheKey = this.generateCacheKey(query, args);
		
		// Get or create cache entry
		if (!this.cache.has(cacheKey)) {
			const entry = this.createCacheEntry(query, args, options.initialData);
			this.cache.set(cacheKey, entry);
		}

		const entry = this.cache.get(cacheKey)!;
		
		// Add subscriber
		entry.subscribers.add(callback);

		// Return unsubscribe function
		const unsubscribe = () => {
			entry.subscribers.delete(callback);
			
			// Clean up cache entry if no more subscribers
			if (entry.subscribers.size === 0) {
				if (entry.unsubscribe) {
					entry.unsubscribe();
				}
				this.cache.delete(cacheKey);
			}
		};

		return { entry, unsubscribe };
	}

	// Method for optimistic updates
	updateQueryData<Query extends FunctionReference<'query'>>(
		query: Query,
		args: FunctionArgs<Query>,
		updater: (data: FunctionReturnType<Query>) => FunctionReturnType<Query>
	): void {
		const cacheKey = this.generateCacheKey(query, args);
		const entry = this.cache.get(cacheKey);
		
		if (entry && entry.data !== undefined) {
			const newData = updater(entry.data);
			entry.data = newData;
			entry.isStale = true; // Mark as stale since it's an optimistic update
			this.notifySubscribers(entry);
		}
	}

	// Method to invalidate and refetch a query
	invalidateQuery<Query extends FunctionReference<'query'>>(
		query: Query,
		args: FunctionArgs<Query>
	): void {
		const cacheKey = this.generateCacheKey(query, args);
		const entry = this.cache.get(cacheKey);
		
		if (entry) {
			entry.isLoading = true;
			entry.isStale = false;
			this.notifySubscribers(entry);
		}
	}

	// Method to get current data without subscribing
	getQueryData<Query extends FunctionReference<'query'>>(
		query: Query,
		args: FunctionArgs<Query>
	): FunctionReturnType<Query> | undefined {
		const cacheKey = this.generateCacheKey(query, args);
		const entry = this.cache.get(cacheKey);
		return entry?.data;
	}

	// Clean up all subscriptions
	destroy(): void {
		this.cache.forEach(entry => {
			if (entry.unsubscribe) {
				entry.unsubscribe();
			}
		});
		this.cache.clear();
	}
}

export const useConvexClient = (): ConvexClient => {
	const client = getContext(_contextKey) as ConvexClient | undefined;
	if (!client) {
		throw new Error(
			'No ConvexClient was found in Svelte context. Did you forget to call setupConvex() in a parent component?'
		);
	}
	return client;
};

export const useConvexStore = (): ConvexQueryStore | null => {
	// Return null on server instead of throwing - let callers handle gracefully
	if (!BROWSER) {
		return null;
	}
	
	const store = getContext(_storeContextKey) as ConvexQueryStore | undefined;
	if (!store) {
		throw new Error(
			'No ConvexQueryStore was found in Svelte context. Did you forget to call setupConvex() in a parent component?'
		);
	}
	return store;
};

export const setConvexClientContext = (client: ConvexClient): void => {
	setContext(_contextKey, client);
};

export const setupConvex = (url: string, options: ConvexClientOptions = {}) => {
	if (!url || typeof url !== 'string') {
		throw new Error('Expected string url property for setupConvex');
	}
	const optionsWithDefaults = { disabled: !BROWSER, ...options };

	const client = new ConvexClient(url, optionsWithDefaults);
	
	setConvexClientContext(client);
	
	// Only create and set store context in browser
	if (BROWSER) {
		const store = new ConvexQueryStore(client);
		setContext(_storeContextKey, store);
		
		$effect(() => () => {
			store.destroy();
			client.close();
		});
	} else {
		// On server, just set up client cleanup
		$effect(() => () => {
			client.close();
		});
	}
};

type UseQueryOptions<Query extends FunctionReference<'query'>> = {
	// Use this data and assume it is up to date (typically for SSR and hydration)
	initialData?: FunctionReturnType<Query>;
	// Instead of loading, render result from outdated args
	keepPreviousData?: boolean;
};

type UseQueryReturn<Query extends FunctionReference<'query'>> =
	| { data: undefined; error: undefined; isLoading: true; isStale: false }
	| { data: undefined; error: Error; isLoading: false; isStale: boolean }
	| { data: FunctionReturnType<Query>; error: undefined; isLoading: false; isStale: boolean };

/**
 * Subscribe to a Convex query and return a reactive query result object.
 * Uses global caching so identical queries share the same connection and state.
 *
 * @param query - a FunctionReference like `api.dir1.dir2.filename.func`.
 * @param args - The arguments to the query function.
 * @param options - UseQueryOptions like `initialData` and `keepPreviousData`.
 * @returns an object containing data, isLoading, error, and isStale.
 */
export function useQuery<Query extends FunctionReference<'query'>>(
	query: Query,
	args: FunctionArgs<Query> | (() => FunctionArgs<Query>) = {},
	options: UseQueryOptions<Query> | (() => UseQueryOptions<Query>) = {}
): UseQueryReturn<Query> {
	const client = useConvexClient();
	
	if (typeof query === 'string') {
		throw new Error('Query must be a functionReference object, not a string');
	}

	// Handle SSR case - fall back to original behavior when store is not available
	const store = useConvexStore();
	
	if (!store || !BROWSER) {
		// Fallback to original single-query behavior for SSR/server
		const state: {
			result: FunctionReturnType<Query> | Error | undefined;
			lastResult: FunctionReturnType<Query> | Error | undefined;
			argsForLastResult: FunctionArgs<Query> | undefined;
			haveArgsEverChanged: boolean;
		} = $state({
			result: parseOptions(options).initialData,
			argsForLastResult: undefined,
			lastResult: undefined,
			haveArgsEverChanged: false
		});

		// When args change we need to unsubscribe to the old query and subscribe to the new one.
		$effect(() => {
			if (!BROWSER || client.disabled) return;
			
			const argsObject = parseArgs(args);
			const unsubscribe = client.onUpdate(
				query,
				argsObject,
				(dataFromServer) => {
					const copy = structuredClone(dataFromServer);
					state.result = copy;
					state.argsForLastResult = argsObject;
					state.lastResult = copy;
				},
				(e: Error) => {
					state.result = e;
					state.argsForLastResult = argsObject;
					const copy = structuredClone(e);
					state.lastResult = copy;
				}
			);
			return unsubscribe;
		});

		// Are the args (the query key) the same as the last args we received a result for?
		const sameArgsAsLastResult = $derived(
			!!state.argsForLastResult &&
				JSON.stringify(convexToJson(state.argsForLastResult)) ===
					JSON.stringify(convexToJson(parseArgs(args)))
		);
		const staleAllowed = $derived(!!(parseOptions(options).keepPreviousData && state.lastResult));

		// Not reactive
		const initialArgs = parseArgs(args);
		// Once args change, move off of initialData.
		$effect(() => {
			if (!state.haveArgsEverChanged) {
				if (
					JSON.stringify(convexToJson(parseArgs(args))) !== JSON.stringify(convexToJson(initialArgs))
				) {
					state.haveArgsEverChanged = true;
					const opts = parseOptions(options);
					if (opts.initialData !== undefined) {
						state.argsForLastResult = $state.snapshot(initialArgs);
						state.lastResult = parseOptions(options).initialData;
					}
				}
			}
		});

		// Return value or undefined; never an error object.
		const syncResult: FunctionReturnType<Query> | undefined = $derived.by(() => {
			const opts = parseOptions(options);
			if (opts.initialData && !state.haveArgsEverChanged) {
				return state.result;
			}
			let value;
			try {
				value = client.disabled
					? undefined
					: client.client.localQueryResult(getFunctionName(query), parseArgs(args));
			} catch (e) {
				if (!(e instanceof Error)) {
					console.error('threw non-Error instance', e);
					throw e;
				}
				value = e;
			}
			// If state result has updated then it's time to check the for a new local value
			state.result;
			return value;
		});

		const result = $derived.by(() => {
			return syncResult !== undefined ? syncResult : staleAllowed ? state.lastResult : undefined;
		});
		const isStale = $derived(
			syncResult === undefined && staleAllowed && !sameArgsAsLastResult && result !== undefined
		);
		const data = $derived.by(() => {
			if (result instanceof Error) {
				return undefined;
			}
			return result;
		});
		const error = $derived.by(() => {
			if (result instanceof Error) {
				return result;
			}
			return undefined;
		});

		return {
			get data() {
				return data;
			},
			get isLoading() {
				return error === undefined && data === undefined;
			},
			get error() {
				return error;
			},
			get isStale() {
				return isStale;
			}
		} as UseQueryReturn<Query>;
	}

	// Browser-only cached behavior - FIXED VERSION
	// Use simple $state instead of complex $derived chains to avoid reactivity cycles
	const localState = $state({
		data: undefined as FunctionReturnType<Query> | undefined,
		error: undefined as Error | undefined,
		isLoading: true,
		isStale: false
	});
	
	let currentSubscription: (() => void) | null = null;
	let currentEntry: QueryCacheEntry<Query> | null = null;

	// When args change, update subscription
	$effect(() => {
		const argsObject = parseArgs(args);
		const optionsObject = parseOptions(options);
		
		// Clean up previous subscription
		if (currentSubscription) {
			currentSubscription();
		}

		// Subscribe to the store
		const { entry, unsubscribe } = store.subscribe(
			query,
			argsObject,
			() => {
				// Update local state directly when cache changes
				updateLocalStateFromEntry(entry, argsObject, optionsObject);
			},
			optionsObject
		);

		currentEntry = entry;
		currentSubscription = unsubscribe;
		
		// Set initial state from entry
		updateLocalStateFromEntry(entry, argsObject, optionsObject);
		
		return () => {
			if (currentSubscription) {
				currentSubscription();
			}
		};
	});

	// Helper function to update local state from cache entry
	function updateLocalStateFromEntry(
		entry: QueryCacheEntry<Query>, 
		argsObject: FunctionArgs<Query>, 
		optionsObject: UseQueryOptions<Query>
	) {
		// Check if we should use stale data
		const sameArgsAsLastResult = !!(
			entry.argsForLastResult &&
			JSON.stringify(convexToJson(entry.argsForLastResult)) ===
			JSON.stringify(convexToJson(argsObject))
		);

		const staleAllowed = !!(optionsObject.keepPreviousData && entry.lastResult);
		
		// Determine data to show
		let dataToShow: FunctionReturnType<Query> | undefined = undefined;
		let errorToShow: Error | undefined = undefined;
		let isLoadingToShow = true;
		let isStaleToShow = false;

		// Priority 1: Current data from cache
		if (entry.data !== undefined) {
			dataToShow = entry.data;
			errorToShow = undefined;
			isLoadingToShow = false;
			isStaleToShow = entry.isStale;
		}
		// Priority 2: Current error from cache
		else if (entry.error !== undefined) {
			dataToShow = undefined;
			errorToShow = entry.error;
			isLoadingToShow = false;
			isStaleToShow = entry.isStale;
		}
		// Priority 3: Stale data if allowed
		else if (staleAllowed && !sameArgsAsLastResult && entry.lastResult !== undefined && !(entry.lastResult instanceof Error)) {
			dataToShow = entry.lastResult;
			errorToShow = undefined;
			isLoadingToShow = false;
			isStaleToShow = true;
		}
		// Priority 4: Try sync result for immediate data
		else {
			try {
				const syncResult = client.disabled
					? undefined
					: client.client.localQueryResult(getFunctionName(query), argsObject);
				
				if (syncResult !== undefined && !(syncResult instanceof Error)) {
					dataToShow = syncResult;
					errorToShow = undefined;
					isLoadingToShow = false;
					isStaleToShow = false;
				} else if (syncResult instanceof Error) {
					dataToShow = undefined;
					errorToShow = syncResult;
					isLoadingToShow = false;
					isStaleToShow = false;
				} else {
					// Still loading
					dataToShow = undefined;
					errorToShow = undefined;
					isLoadingToShow = true;
					isStaleToShow = false;
				}
			} catch (e) {
				if (e instanceof Error) {
					dataToShow = undefined;
					errorToShow = e;
					isLoadingToShow = false;
					isStaleToShow = false;
				} else {
					// Still loading
					dataToShow = undefined;
					errorToShow = undefined;
					isLoadingToShow = true;
					isStaleToShow = false;
				}
			}
		}

		// Update local state
		localState.data = dataToShow;
		localState.error = errorToShow;
		localState.isLoading = isLoadingToShow;
		localState.isStale = isStaleToShow;
	}

	return {
		get data() {
			return localState.data;
		},
		get isLoading() {
			return localState.isLoading;
		},
		get error() {
			return localState.error;
		},
		get isStale() {
			return localState.isStale;
		}
	} as UseQueryReturn<Query>;
}

/**
 * Hook to perform optimistic updates on cached query data
 */
export function useOptimisticUpdate() {
	const store = useConvexStore();
	
	// Return no-op functions if store is not available (SSR)
	if (!store) {
		return {
			updateQueryData: () => {},
			invalidateQuery: () => {},
			getQueryData: () => undefined
		};
	}
	
	return {
		/**
		 * Optimistically update query data in the cache
		 */
		updateQueryData: <Query extends FunctionReference<'query'>>(
			query: Query,
			args: FunctionArgs<Query>,
			updater: (data: FunctionReturnType<Query>) => FunctionReturnType<Query>
		) => {
			store.updateQueryData(query, args, updater);
		},
		
		/**
		 * Invalidate and refetch a query
		 */
		invalidateQuery: <Query extends FunctionReference<'query'>>(
			query: Query,
			args: FunctionArgs<Query>
		) => {
			store.invalidateQuery(query, args);
		},
		
		/**
		 * Get current cached data for a query without subscribing
		 */
		getQueryData: <Query extends FunctionReference<'query'>>(
			query: Query,
			args: FunctionArgs<Query>
		): FunctionReturnType<Query> | undefined => {
			return store.getQueryData(query, args);
		}
	};
}

// Helper functions remain the same
function parseArgs(
	args: Record<string, Value> | (() => Record<string, Value>)
): Record<string, Value> {
	if (typeof args === 'function') {
		args = args();
	}
	return $state.snapshot(args);
}

function parseOptions<Query extends FunctionReference<'query'>>(
	options: UseQueryOptions<Query> | (() => UseQueryOptions<Query>)
): UseQueryOptions<Query> {
	if (typeof options === 'function') {
		options = options();
	}
	return $state.snapshot(options);
}