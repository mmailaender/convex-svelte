<script lang="ts">
	import { useConvexClient, useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	const client = useConvexClient();
	const numbers = useQuery(api.numbers.get, {});

	let optimisticallyUpdated = $state(false);
	let resetDone = $state(false);

	async function updateOptimistic() {
		await client.mutation(
			api.numbers.update,
			{ a: 42, b: 0, c: 0 },
			{
				optimisticUpdate: (store) => {
					store.setQuery(api.numbers.get, {}, { a: 42, b: 0, c: 0 });
				}
			}
		);
		optimisticallyUpdated = true;
	}

	async function reset() {
		await client.mutation(api.numbers.update, { a: 0, b: 0, c: 0 });
		resetDone = true;
	}
</script>

<svelte:head>
	<title>Optimistic Update Test</title>
</svelte:head>

<h1>Optimistic Update Test</h1>

<div>
	<button data-testid="update-btn" onclick={updateOptimistic}>Update Optimistically</button>
	<button data-testid="reset-btn" onclick={reset}>Reset</button>
</div>

<p data-testid="optimistically-updated">optimisticallyUpdated: {optimisticallyUpdated}</p>
<p data-testid="reset-done">resetDone: {resetDone}</p>

{#if numbers.isLoading}
	<p data-testid="loading">Loading...</p>
{:else if numbers.error}
	<p data-testid="error">{numbers.error.message}</p>
{:else}
	<p data-testid="data">a={numbers.data!.a} b={numbers.data!.b} c={numbers.data!.c}</p>
	<p data-testid="value-a">valueA: {numbers.data!.a}</p>
{/if}
