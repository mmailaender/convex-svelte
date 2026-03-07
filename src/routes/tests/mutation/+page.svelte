<script lang="ts">
	import { useConvexClient, useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';

	const client = useConvexClient();
	const TEST_AUTHOR = '__e2e_mutation_test__';

	const messages = useQuery(api.messages.list, () => ({ muteWords: [] }));

	let sent = $state(false);
	let cleaned = $state(false);

	async function sendTestMessage() {
		await client.mutation(api.messages.send, {
			author: TEST_AUTHOR,
			body: 'Hello from mutation e2e test'
		});
		sent = true;
	}

	async function cleanup() {
		await client.mutation(api.messages.deleteByAuthor, {
			author: TEST_AUTHOR
		});
		cleaned = true;
	}

	const testMessageExists = $derived(messages.data?.some((m) => m.author === TEST_AUTHOR) ?? false);
</script>

<svelte:head>
	<title>Mutation Test</title>
</svelte:head>

<h1>Mutation Test</h1>

<div>
	<button data-testid="send-btn" onclick={sendTestMessage}>Send Message</button>
	<button data-testid="cleanup-btn" onclick={cleanup}>Cleanup</button>
</div>

<p data-testid="sent">sent: {sent}</p>
<p data-testid="cleaned">cleaned: {cleaned}</p>
<p data-testid="test-message-exists">testMessageExists: {testMessageExists}</p>

{#if messages.isLoading}
	<p data-testid="loading">Loading...</p>
{:else if messages.error}
	<p data-testid="error">{messages.error.message}</p>
{:else}
	<p data-testid="data">Loaded {messages.data!.length} messages</p>
{/if}
