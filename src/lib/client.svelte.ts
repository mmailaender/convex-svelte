import { getContext, setContext, untrack } from 'svelte';
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

export const useConvexClient = (): ConvexClient => {
	const client = getContext(_contextKey) as ConvexClient | undefined;
	if (!client) {
		throw new Error(
			'No ConvexClient was found in Svelte context. Did you forget to call setupConvex() in a parent component?'
		);
	}
	return client;
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
	$effect(() => () => client.close());
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

// Note that swapping out the current Convex client is not supported.
/**
 * Subscribe to a Convex query and return a reactive query result object.
 * Pass reactive args object or a closure returning args to update args reactively.
 *
 * @param query - a FunctionRefernece like `api.dir1.dir2.filename.func`.
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
	const state: {
		result: FunctionReturnType<Query> | Error | undefined;
		// The last result we actually received, if this query has ever received one.
		lastResult: FunctionReturnType<Query> | Error | undefined;
		// The args (query key) of the last result that was received.
		argsForLastResult: FunctionArgs<Query>;
		// If the args have never changed, fine to use initialData if provided.
		haveArgsEverChanged: boolean;
	} = $state({
		result: parseOptions(options).initialData,
		argsForLastResult: undefined,
		lastResult: undefined,
		haveArgsEverChanged: false
	});

	// When args change we need to unsubscribe to the old query and subscribe
	// to the new one.
	$effect(() => {
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
				// is it important to copy the error here?
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
		if (!untrack(() => state.haveArgsEverChanged)) {
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
				// This should not happen by the API of localQueryResult().
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

	// This TypeScript cast promises data is not undefined if error and isLoading are checked first.
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

// args can be an object or a closure returning one
function parseArgs(
	args: Record<string, Value> | (() => Record<string, Value>)
): Record<string, Value> {
	if (typeof args === 'function') {
		args = args();
	}
	return $state.snapshot(args);
}

// options can be an object or a closure
function parseOptions<Query extends FunctionReference<'query'>>(
	options: UseQueryOptions<Query> | (() => UseQueryOptions<Query>)
): UseQueryOptions<Query> {
	if (typeof options === 'function') {
		options = options();
	}
	return $state.snapshot(options);
}
