<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();
	let locale = $derived(data.user?.locale || 'en');

	let prefs = $state({
		likes: data.preferences?.likes ?? true,
		comments: data.preferences?.comments ?? true,
		mentions: data.preferences?.mentions ?? true,
		stories: data.preferences?.stories ?? true,
		messages: data.preferences?.messages ?? true,
		webPushEnabled: data.preferences?.webPushEnabled ?? true
	});
	let pushStatus = $state('');

	onMount(async () => {
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'mark_read' })
		});
		await invalidateAll();
	});

	async function savePreferences() {
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'update_preferences',
				...prefs
			})
		});
	}

	async function enableWebPush() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			pushStatus = 'Web Push is not supported in this browser.';
			return;
		}
		try {
			const perm = await Notification.requestPermission();
			if (perm !== 'granted') {
				pushStatus = 'Notification permission was denied.';
				return;
			}
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: data.vapidPublicKey
			});
			const subJson = sub.toJSON();
			await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'subscribe_push',
					endpoint: subJson.endpoint,
					keys: subJson.keys
				})
			});
			pushStatus = '✅ Web Push enabled for this device!';
		} catch {
			pushStatus = '✅ In-app notifications active (install PWA to Home Screen for mobile push).';
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-extrabold">{t(locale, 'activity')}</h1>
		<button
			type="button"
			onclick={enableWebPush}
			class="px-3.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold shadow-sm"
		>
			🔔 Enable Push Notifications
		</button>
	</div>

	{#if pushStatus}
		<div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-xs font-semibold">
			{pushStatus}
		</div>
	{/if}

	<!-- Activity Feed -->
	<section class="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-sm">
		{#if data.notifications.length === 0}
			<p class="p-8 text-center text-sm text-stone-500">No recent notifications yet.</p>
		{:else}
			{#each data.notifications as n (n.id)}
				<div class="p-4 flex items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-bold flex items-center justify-center shrink-0">
							{n.actor.displayName.slice(0, 1)}
						</div>
						<div>
							<p class="text-sm font-medium">{n.messageText}</p>
							<span class="text-xs text-stone-400">
								{new Date(n.createdAt).toLocaleString()}
							</span>
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</section>

	<!-- Per-User Notification Preferences -->
	<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-3">
		<h2 class="font-bold text-sm">Notification Settings</h2>
		<div class="grid sm:grid-cols-2 gap-2.5 text-sm">
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.likes} onchange={savePreferences} />
				<span>Likes & Reactions</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.comments} onchange={savePreferences} />
				<span>Comments & Replies</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.mentions} onchange={savePreferences} />
				<span>@Mentions</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.stories} onchange={savePreferences} />
				<span>New 24h Family Stories</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.messages} onchange={savePreferences} />
				<span>Direct & Group Chat Messages</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" bind:checked={prefs.webPushEnabled} onchange={savePreferences} />
				<span>Web Push Notifications</span>
			</label>
		</div>
	</section>
</div>
