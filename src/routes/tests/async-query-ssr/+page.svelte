<script lang="ts">
	import { useQuery } from '$lib/client.svelte.js';
	import { api } from '../../../convex/_generated/api.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const result = useQuery(
		api.messages.list,
		() => ({ muteWords: [] }),
		() => ({ initialData: data.messages })
	);
</script>

<section>
	<h1>Async Query SSR Test</h1>

	<div data-testid="initial-data-info">
		<p>Initial data count: {data.messages?.length ?? 0}</p>
	</div>

	<svelte:boundary>
		{#snippet pending()}
			<p data-testid="pending">Loading...</p>
		{/snippet}

		{#snippet failed(error, reset)}
			<p data-testid="error">Error: {(error as Error).message}</p>
			<button onclick={reset} data-testid="reset-btn">Retry</button>
		{/snippet}

		{@const msgs = await result}

		<div data-testid="query-state">
			{#if msgs}
				<p data-testid="data">Data: {msgs.length} messages</p>
			{:else}
				<p data-testid="no-data">No data</p>
			{/if}
		</div>
	</svelte:boundary>
</section>
