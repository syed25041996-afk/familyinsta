<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();
	let locale = $derived(data.user?.locale || 'en');

	let conversationsList = $state(data.conversations || []);
	let activeConvId = $state<string | null>(data.activeConversationId || null);
	let messagesList = $state(data.messages || []);

	$effect(() => {
		conversationsList = data.conversations || [];
		activeConvId = data.activeConversationId || null;
		messagesList = data.messages || [];
	});

	let messageText = $state('');
	let attachedMedia = $state<{ id: string; thumbUrl: string } | null>(null);
	let showNewChatModal = $state(false);
	let selectedRecipientIds = $state<string[]>([]);
	let groupChatTitle = $state('');
	let sending = $state(false);
	let errorMsg = $state('');

	onMount(() => {
		// Mark current conversation read on open
		if (activeConvId && messagesList.length > 0) {
			const lastId = messagesList[messagesList.length - 1]?.id;
			fetch('/api/conversations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'read',
					conversationId: activeConvId,
					lastMessageId: lastId
				})
			});
		}

		const onWs = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.type === 'chat:message' || detail?.type === 'chat:read') {
				invalidateAll();
			}
		};
		window.addEventListener('kinship:ws', onWs);
		return () => window.removeEventListener('kinship:ws', onWs);
	});

	async function selectConversation(id: string) {
		await goto(`/messages?c=${encodeURIComponent(id)}`);
	}

	function toggleRecipient(uid: string) {
		if (selectedRecipientIds.includes(uid)) {
			selectedRecipientIds = selectedRecipientIds.filter((i) => i !== uid);
		} else {
			selectedRecipientIds = [...selectedRecipientIds, uid];
		}
	}

	async function startNewConversation(e: Event) {
		e.preventDefault();
		if (selectedRecipientIds.length === 0) return;
		errorMsg = '';
		const res = await fetch('/api/conversations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'start',
				recipientIds: selectedRecipientIds,
				title: groupChatTitle
			})
		});
		const json = await res.json();
		if (!res.ok) {
			errorMsg = json.error || 'Could not start chat';
			return;
		}
		showNewChatModal = false;
		selectedRecipientIds = [];
		groupChatTitle = '';
		await goto(`/messages?c=${encodeURIComponent(json.conversationId)}`);
	}

	async function handleAttachMedia(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const fd = new FormData();
		fd.append('file', file);
		fd.append('altText', file.name);

		const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
		const json = await res.json();
		if (res.ok && json.media) {
			attachedMedia = { id: json.media.id, thumbUrl: json.media.thumbUrl };
		}
		input.value = '';
	}

	async function sendMessage(e: Event) {
		e.preventDefault();
		if (!activeConvId || (!messageText.trim() && !attachedMedia)) return;
		sending = true;
		await fetch('/api/conversations', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'send',
				conversationId: activeConvId,
				body: messageText,
				mediaId: attachedMedia?.id || null
			})
		});
		messageText = '';
		attachedMedia = null;
		sending = false;
		await invalidateAll();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-extrabold">{t(locale, 'messages')}</h1>
		<button
			type="button"
			onclick={() => (showNewChatModal = !showNewChatModal)}
			class="px-3.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold shadow-sm"
		>
			+ New Chat / Family Group
		</button>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">{errorMsg}</div>
	{/if}

	{#if showNewChatModal}
		<form
			onsubmit={startNewConversation}
			class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 space-y-4"
		>
			<h2 class="font-bold text-sm">Start 1:1 or Family Group Chat</h2>
			<div>
				<span class="block text-xs text-stone-500 mb-2">
					Select 1 relative for a direct chat, or multiple for a group chat:
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each data.availableContacts as c}
						<button
							type="button"
							onclick={() => toggleRecipient(c.id)}
							class="px-3 py-1.5 rounded-full text-xs font-semibold border {selectedRecipientIds.includes(
								c.id
							)
								? 'bg-brand-600 text-white border-brand-600'
								: 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-700'}"
						>
							{c.displayName} ({c.relationshipLabel})
						</button>
					{/each}
				</div>
			</div>

			{#if selectedRecipientIds.length > 1}
				<div>
					<label for="grp-title" class="block text-xs font-semibold mb-1">Group Chat Name</label>
					<input
						id="grp-title"
						type="text"
						bind:value={groupChatTitle}
						placeholder="e.g. Cousins Squad or Sunday Lunch"
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
					/>
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showNewChatModal = false)}
					class="px-3 py-1.5 rounded-xl text-xs bg-stone-200 dark:bg-stone-800"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-4 py-1.5 rounded-xl text-xs font-bold bg-brand-600 text-white"
				>
					Open Chat
				</button>
			</div>
		</form>
	{/if}

	<!-- Conversation Pills Bar -->
	{#if conversationsList.length > 0}
		<div class="flex gap-2 overflow-x-auto no-scrollbar pb-1">
			{#each conversationsList as conv (conv.id)}
				<button
					type="button"
					onclick={() => selectConversation(conv.id)}
					class="px-4 py-2 rounded-2xl text-xs font-bold shrink-0 border transition {activeConvId ===
					conv.id
						? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-transparent'
						: 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'}"
				>
					<span>{conv.type === 'group' ? '👨‍👩‍👧‍👦' : '💬'} {conv.title}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- Active Chat Thread -->
	{#if activeConvId}
		<div class="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-sm flex flex-col h-[62vh]">
			<div class="flex-1 p-4 overflow-y-auto space-y-3">
				{#if messagesList.length === 0}
					<p class="text-center text-xs text-stone-400 py-10">
						Say hello to start the family conversation!
					</p>
				{:else}
					{#each messagesList as msg (msg.id)}
						{@const isMine = msg.sender.id === data.user?.id}
						<div class="flex flex-col {isMine ? 'items-end' : 'items-start'}">
							<div class="text-[11px] text-stone-400 mb-0.5 px-1">
								{msg.sender.displayName} ({msg.sender.relationshipLabel})
							</div>
							<div
								class="max-w-[78%] rounded-2xl p-3 text-sm {isMine
									? 'bg-brand-600 text-white rounded-br-sm'
									: 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-bl-sm'}"
							>
								{#if msg.media}
									<img
										src={msg.media.displayUrl}
										alt={msg.media.altText}
										class="rounded-xl max-h-52 object-cover mb-2"
									/>
								{/if}
								{#if msg.body}
									<p>{msg.body}</p>
								{/if}
							</div>
							<!-- Read Receipts -->
							{#if msg.seenBy && msg.seenBy.length > 0}
								<div class="text-[10px] text-stone-400 mt-0.5 px-1">
									✓✓ Seen by {msg.seenBy.join(', ')}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Message Composer -->
			<div class="p-3 border-t border-stone-200 dark:border-stone-800">
				{#if attachedMedia}
					<div class="mb-2 flex items-center gap-2 bg-stone-100 dark:bg-stone-800 p-2 rounded-xl">
						<img src={attachedMedia.thumbUrl} alt="Attached preview" class="w-10 h-10 rounded-lg object-cover" />
						<span class="text-xs font-medium flex-1">Photo attached</span>
						<button type="button" onclick={() => (attachedMedia = null)} class="text-xs px-2">✕</button>
					</div>
				{/if}
				<form onsubmit={sendMessage} class="flex items-center gap-2">
					<label class="cursor-pointer p-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-sm">
						📷
						<input type="file" accept="image/*,video/*" onchange={handleAttachMedia} class="hidden" />
					</label>
					<input
						type="text"
						bind:value={messageText}
						placeholder="Write a message..."
						class="flex-1 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
					/>
					<button
						type="submit"
						disabled={sending}
						class="px-4 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-xs"
					>
						Send
					</button>
				</form>
			</div>
		</div>
	{:else}
		<div class="text-center py-12 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6">
			<p class="text-sm text-stone-500">No conversations yet. Start a 1:1 or family group chat above!</p>
		</div>
	{/if}
</div>
