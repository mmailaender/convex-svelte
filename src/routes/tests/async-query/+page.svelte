<script lang="ts">
	import { useQuery } from '$lib/client.svelte.js';
	import { api } from '../../../convex/_generated/api.js';

	let skipQuery = $state(false);

	const result = useQuery(api.messages.list, () => (skipQuery ? 'skip' : { muteWords: [] }));
</script>

<section>
	<h1>Async Query Test</h1>

	<label>
		<input type="checkbox" bind:checked={skipQuery} data-testid="skip-checkbox" />
		Skip Query
	</label>

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
			{#if result.isStale}
				<p data-testid="is-stale">Stale data</p>
			{/if}
		</div>
	</svelte:boundary>
</section>
