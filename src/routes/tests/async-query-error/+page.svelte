<script lang="ts">
	import { useQuery } from '$lib/client.svelte.js';
	import { api } from '../../../convex/_generated/api.js';

	const result = useQuery(api.messages.error, {});
</script>

<section>
	<h1>Async Query Error Test</h1>

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
				<p data-testid="data">Has data (unexpected)</p>
			{:else}
				<p data-testid="no-data">No data</p>
			{/if}
		</div>
	</svelte:boundary>
</section>
