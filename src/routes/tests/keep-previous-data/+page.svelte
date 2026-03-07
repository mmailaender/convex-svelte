<script lang="ts">
	import { useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	let muteWords = $state<string[]>([]);

	const messages = useQuery(api.messages.list, () => ({ muteWords }), { keepPreviousData: true });

	let initialCount = $state<number | null>(null);

	$effect(() => {
		if (messages.data && initialCount === null) {
			initialCount = messages.data.length;
		}
	});
</script>

<svelte:head>
	<title>Keep Previous Data Test</title>
</svelte:head>

<h1>Keep Previous Data Test</h1>

<div>
	<button data-testid="change-args" onclick={() => (muteWords = ['__nonexistent_mute_word_xyz__'])}>
		Change Args
	</button>
	<button data-testid="reset-args" onclick={() => (muteWords = [])}> Reset Args </button>
</div>

<p data-testid="is-stale">isStale: {messages.isStale}</p>
<p data-testid="is-loading">isLoading: {messages.isLoading}</p>
<p data-testid="initial-count">initialCount: {initialCount}</p>

{#if messages.isLoading}
	<p data-testid="loading">Loading...</p>
{:else if messages.error}
	<p data-testid="error">{messages.error.message}</p>
{:else}
	<p data-testid="data">Loaded {messages.data!.length} messages</p>
{/if}
