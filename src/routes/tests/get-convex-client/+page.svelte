<script lang="ts">
	import { useQuery } from '$lib/index.js';
	import { api } from '../../../convex/_generated/api.js';
	import { sendTestMessage, deleteTestMessages } from './message-service.js';

	const TEST_AUTHOR = '__e2e_get_client_test__';
	const messages = useQuery(api.messages.list, () => ({ muteWords: [] }));

	let sent = $state(false);
	let cleaned = $state(false);

	const testMessageExists = $derived(messages.data?.some((m) => m.author === TEST_AUTHOR) ?? false);
</script>

<svelte:head>
	<title>getConvexClient Test</title>
</svelte:head>

<h1>getConvexClient Test</h1>
<p>Tests calling mutations from a plain .ts utility file using getConvexClient()</p>

<div>
	<button
		data-testid="send-btn"
		onclick={() => sendTestMessage(TEST_AUTHOR, 'From utility file').then(() => (sent = true))}
	>
		Send via utility
	</button>
	<button
		data-testid="cleanup-btn"
		onclick={() => deleteTestMessages(TEST_AUTHOR).then(() => (cleaned = true))}
	>
		Cleanup
	</button>
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
