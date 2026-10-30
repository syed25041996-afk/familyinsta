<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();
	let locale = $derived(data.user?.locale || 'en');
	let isOwnProfile = $derived(data.user?.id === data.profile.id);

	let showEditModal = $state(false);
	let displayName = $state('');
	let relationshipLabel = $state('');
	let bio = $state('');
	let activeHighlight = $state<(typeof data.highlights)[0] | null>(null);
	let passkeyMsg = $state('');
	let contactRequested = $state(false);

	function openEdit() {
		displayName = data.profile.displayName;
		relationshipLabel = data.profile.relationshipLabel;
		bio = data.profile.bio || '';
		showEditModal = true;
	}

	async function saveProfile(e: Event) {
		e.preventDefault();
		await fetch('/api/users/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				displayName,
				relationshipLabel,
				bio
			})
		});
		showEditModal = false;
		await invalidateAll();
	}

	async function handleAvatarUpload(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const fd = new FormData();
		fd.append('file', file);
		fd.append('altText', `${data.profile.displayName} avatar`);

		const upRes = await fetch('/api/media/upload', { method: 'POST', body: fd });
		const upJson = await upRes.json();
		if (upRes.ok && upJson.media?.id) {
			await fetch('/api/users/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ avatarMediaId: upJson.media.id })
			});
			await invalidateAll();
		}
	}

	async function registerPasskey() {
		passkeyMsg = '';
		try {
			const optRes = await fetch('/api/auth/passkey?mode=register');
			const opts = await optRes.json();
			if (!window.PublicKeyCredential) {
				passkeyMsg = 'Passkeys require a WebAuthn-capable browser.';
				return;
			}
			const challengeBytes = Uint8Array.from(
				atob(opts.challenge.replace(/-/g, '+').replace(/_/g, '/')),
				(c) => c.charCodeAt(0)
			);
			const userIdBytes = new TextEncoder().encode(opts.user.id);

			const cred = (await navigator.credentials.create({
				publicKey: {
					challenge: challengeBytes,
					rp: { name: opts.rp.name, id: window.location.hostname },
					user: {
						id: userIdBytes,
						name: opts.user.name,
						displayName: opts.user.displayName
					},
					pubKeyCredParams: [{ alg: -7, type: 'public-key' }]
				}
			})) as PublicKeyCredential | null;

			if (!cred) return;

			await fetch('/api/auth/passkey', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'register',
					credentialId: cred.id,
					publicKey: cred.id,
					deviceName: navigator.platform || 'Family Device'
				})
			});
			passkeyMsg = '✅ Passkey registered for passwordless sign-in!';
		} catch {
			passkeyMsg = 'Passkey setup cancelled or not supported in this environment.';
		}
	}

	async function requestChildCircleApproval() {
		await fetch('/api/users/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'request_child_contact',
				targetUserId: data.profile.id
			})
		});
		contactRequested = true;
	}
</script>

<div class="space-y-6">
	<!-- Profile Header Card -->
	<section class="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-sm">
		<div class="flex flex-col sm:flex-row items-center sm:items-start gap-5">
			<div class="relative">
				{#if data.profile.avatarUrl}
					<img
						src={data.profile.avatarUrl}
						alt={data.profile.displayName}
						class="w-24 h-24 rounded-full object-cover ring-4 ring-brand-100 dark:ring-brand-900"
					/>
				{:else}
					<div class="w-24 h-24 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white text-3xl font-extrabold flex items-center justify-center shadow-md">
						{data.profile.displayName.slice(0, 1)}
					</div>
				{/if}

				{#if isOwnProfile}
					<label
						title="Change Avatar Photo"
						class="cursor-pointer absolute bottom-0 right-0 w-8 h-8 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs shadow"
					>
						📷
						<input type="file" accept="image/*" onchange={handleAvatarUpload} class="hidden" />
					</label>
				{/if}
			</div>

			<div class="flex-1 text-center sm:text-left space-y-2">
				<div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
					<h1 class="text-xl font-extrabold">{data.profile.displayName}</h1>
					<span class="px-3 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-bold">
						🌳 {data.profile.relationshipLabel}
					</span>
					{#if data.profile.role === 'child'}
						<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
							🌱 Child Account
						</span>
					{/if}
				</div>

				<div class="text-xs text-stone-500">@{data.profile.username}</div>

				{#if data.profile.bio}
					<p class="text-sm text-stone-700 dark:text-stone-300 max-w-md">{data.profile.bio}</p>
				{/if}

				<div class="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-1 text-xs font-semibold text-stone-600 dark:text-stone-400">
					<span><strong>{data.posts.length}</strong> Posts</span>
					<span><strong>{data.highlights.length}</strong> Story Highlights</span>
				</div>

				{#if isOwnProfile}
					<div class="flex flex-wrap justify-center sm:justify-start gap-2 pt-2">
						<button
							type="button"
							onclick={openEdit}
							class="px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-xs font-bold"
						>
							✏️ Edit Profile & Relationship
						</button>
						<button
							type="button"
							onclick={registerPasskey}
							class="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-bold"
						>
							🔑 Add Passkey
						</button>
					</div>
					{#if passkeyMsg}
						<p class="text-xs text-brand-600 font-semibold pt-1">{passkeyMsg}</p>
					{/if}
				{/if}
			</div>
		</div>
	</section>

	{#if showEditModal}
		<form
			onsubmit={saveProfile}
			class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 space-y-4"
		>
			<h2 class="font-bold text-sm">Edit Your Family Profile</h2>
			<div class="grid sm:grid-cols-2 gap-3">
				<div>
					<label for="pf-name" class="block text-xs font-semibold mb-1">Display Name</label>
					<input
						id="pf-name"
						type="text"
						bind:value={displayName}
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label for="pf-rel" class="block text-xs font-semibold mb-1">
						Family Tree Relationship Label
					</label>
					<input
						id="pf-rel"
						type="text"
						bind:value={relationshipLabel}
						placeholder="e.g. Nani (Grandma), Mom, Chacha, Cousin"
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
					/>
				</div>
			</div>
			<div>
				<label for="pf-bio" class="block text-xs font-semibold mb-1">Bio</label>
				<textarea
					id="pf-bio"
					rows="2"
					bind:value={bio}
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
				></textarea>
			</div>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showEditModal = false)}
					class="px-4 py-2 rounded-xl text-xs bg-stone-200 dark:bg-stone-800"
				>
					Cancel
				</button>
				<button
					type="submit"
					class="px-5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white"
				>
					Save Changes
				</button>
			</div>
		</form>
	{/if}

	<!-- Child Safety Circle Restriction Notice -->
	{#if data.restrictedForChild}
		<div class="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-3xl p-6 text-center space-y-3">
			<div class="text-3xl">🌱</div>
			<h2 class="font-bold text-base">Protected Child Account Circle</h2>
			<p class="text-xs text-stone-600 dark:text-stone-300 max-w-md mx-auto">
				To view {data.profile.displayName}'s posts or chat together, a Family Admin must approve this connection first.
			</p>
			{#if contactRequested}
				<p class="text-xs font-bold text-emerald-700">✓ Request sent to Family Admins!</p>
			{:else}
				<button
					type="button"
					onclick={requestChildCircleApproval}
					class="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
				>
					{t(locale, 'requestContact')}
				</button>
			{/if}
		</div>
	{:else}
		<!-- Saved Profile Highlights Bar -->
		{#if data.highlights.length > 0}
			<section class="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800">
				<h2 class="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
					Story Highlights
				</h2>
				<div class="flex gap-4 overflow-x-auto no-scrollbar">
					{#each data.highlights as hl (hl.id)}
						<button
							type="button"
							onclick={() => (activeHighlight = hl)}
							class="flex flex-col items-center gap-1 shrink-0"
						>
							<div class="w-16 h-16 rounded-full p-0.5 bg-amber-400">
								{#if hl.coverUrl}
									<img
										src={hl.coverUrl}
										alt={hl.title}
										class="w-full h-full rounded-full object-cover"
									/>
								{:else}
									<div class="w-full h-full rounded-full bg-stone-200 dark:bg-stone-800 flex items-center justify-center">
										⭐
									</div>
								{/if}
							</div>
							<span class="text-xs font-semibold truncate max-w-[76px]">{hl.title}</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<!-- 3-Column Instagram Post Grid -->
		<section class="space-y-3">
			<h2 class="text-xs font-bold uppercase tracking-wider text-stone-500">
				Shared Moments ({data.posts.length})
			</h2>
			{#if data.posts.length === 0}
				<div class="text-center py-12 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800">
					<p class="text-sm text-stone-500">No posts shared yet.</p>
				</div>
			{:else}
				<div class="grid grid-cols-3 gap-2 sm:gap-3">
					{#each data.posts as post (post.id)}
						<div class="group relative aspect-square rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 dark:border-stone-800">
							{#if post.media[0]}
								<img
									src={post.media[0].thumbUrl}
									alt={post.media[0].altText}
									loading="lazy"
									class="w-full h-full object-cover group-hover:scale-105 transition"
								/>
							{/if}
							<div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center text-white text-xs font-bold p-2 text-center">
								<div>❤️ {post.reactionsTotal} · 💬 {post.comments.length}</div>
								{#if post.caption}
									<p class="line-clamp-2 text-[11px] font-normal mt-1">{post.caption}</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

{#if activeHighlight}
	<div class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
		<div class="bg-stone-900 text-white rounded-3xl max-w-md w-full p-5 space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="font-bold">⭐ {activeHighlight.title}</h3>
				<button type="button" onclick={() => (activeHighlight = null)} class="text-lg">✕</button>
			</div>
			<div class="grid grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto">
				{#each activeHighlight.items as item}
					<div class="rounded-xl overflow-hidden bg-black">
						<img src={item.media.displayUrl} alt={item.caption} class="w-full h-44 object-cover" />
						{#if item.caption}
							<p class="p-2 text-xs text-stone-300">{item.caption}</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
