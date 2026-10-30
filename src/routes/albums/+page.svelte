<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();
	let locale = $derived(data.user?.locale || 'en');

	let showNewModal = $state(false);
	let title = $state('');
	let description = $state('');
	let eventDate = $state(new Date().toISOString().slice(0, 10));
	let selectedContributors = $state<string[]>([]);
	let creating = $state(false);
	let uploadingAlbumId = $state<string | null>(null);

	function toggleContributor(uid: string) {
		if (selectedContributors.includes(uid)) {
			selectedContributors = selectedContributors.filter((id) => id !== uid);
		} else {
			selectedContributors = [...selectedContributors, uid];
		}
	}

	async function createAlbum(e: Event) {
		e.preventDefault();
		if (!title.trim()) return;
		creating = true;
		await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'create',
				title,
				description,
				eventDate,
				contributorIds: selectedContributors
			})
		});
		title = '';
		description = '';
		selectedContributors = [];
		showNewModal = false;
		creating = false;
		await invalidateAll();
	}

	async function addPhotosToAlbum(albumId: string, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		uploadingAlbumId = albumId;
		const mediaIds: string[] = [];

		for (const file of Array.from(files)) {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('altText', file.name);
			const upRes = await fetch('/api/media/upload', {
				method: 'POST',
				body: formData
			});
			const upJson = await upRes.json();
			if (upRes.ok && upJson.media?.id) {
				mediaIds.push(upJson.media.id);
			}
		}

		if (mediaIds.length > 0) {
			await fetch('/api/albums', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'add_media',
					albumId,
					mediaIds
				})
			});
		}

		uploadingAlbumId = null;
		input.value = '';
		await invalidateAll();
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-extrabold">{t(locale, 'albums')}</h1>
			<p class="text-xs text-stone-500">
				Shared family collections — contribute photos & download original-quality ZIP archives.
			</p>
		</div>
		<button
			type="button"
			onclick={() => (showNewModal = !showNewModal)}
			class="px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm"
		>
			+ {t(locale, 'newAlbum')}
		</button>
	</div>

	{#if showNewModal}
		<form
			onsubmit={createAlbum}
			class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4"
		>
			<h2 class="font-bold text-base">Create Shared Family Album</h2>
			<div class="grid sm:grid-cols-2 gap-3">
				<div>
					<label for="alb-title" class="block text-xs font-semibold mb-1">Album Title</label>
					<input
						id="alb-title"
						type="text"
						required
						bind:value={title}
						placeholder="e.g. Diwali 2026 or Grandma's 80th"
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label for="alb-date" class="block text-xs font-semibold mb-1">Event Date</label>
					<input
						id="alb-date"
						type="date"
						bind:value={eventDate}
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
					/>
				</div>
			</div>

			<div>
				<label for="alb-desc" class="block text-xs font-semibold mb-1">Description</label>
				<input
					id="alb-desc"
					type="text"
					bind:value={description}
					placeholder="Everyone add your photos from the celebration!"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-sm"
				/>
			</div>

			<div>
				<span class="block text-xs font-semibold mb-1.5">Invite Family Contributors</span>
				<div class="flex flex-wrap gap-1.5">
					{#each data.familyMembers as member}
						{#if member.id !== data.user?.id}
							<button
								type="button"
								onclick={() => toggleContributor(member.id)}
								class="px-2.5 py-1 rounded-full text-xs font-medium border {selectedContributors.includes(
									member.id
								)
									? 'bg-brand-600 text-white border-brand-600'
									: 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-700'}"
							>
								{member.displayName} ({member.relationshipLabel})
							</button>
						{/if}
					{/each}
				</div>
			</div>

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showNewModal = false)}
					class="px-4 py-2 rounded-xl text-xs bg-stone-200 dark:bg-stone-800"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={creating}
					class="px-5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white"
				>
					{creating ? 'Creating...' : 'Create Album'}
				</button>
			</div>
		</form>
	{/if}

	<div class="space-y-6">
		{#each data.albums as album (album.id)}
			<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div class="flex items-center gap-2">
							<h2 class="text-lg font-extrabold">{album.title}</h2>
							<span class="text-xs px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 font-semibold">
								{album.itemCount} items
							</span>
						</div>
						{#if album.description}
							<p class="text-xs text-stone-600 dark:text-stone-400 mt-0.5">{album.description}</p>
						{/if}
						<div class="text-[11px] text-stone-400 mt-1">
							Curated by {album.owner.displayName} ({album.owner.relationshipLabel})
							{#if album.contributors.length > 0}
								· Contributors: {album.contributors.map((c) => c.displayName).join(', ')}
							{/if}
						</div>
					</div>

					<div class="flex items-center gap-2">
						<!-- Add Photos to Album -->
						<label class="cursor-pointer px-3 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-xs font-bold">
							{uploadingAlbumId === album.id ? '⏳ Uploading...' : '＋ Add Photos'}
							<input
								type="file"
								multiple
								accept="image/*,video/*"
								onchange={(e) => addPhotosToAlbum(album.id, e)}
								class="hidden"
							/>
						</label>

						<!-- Download Original Quality ZIP -->
						{#if album.itemCount > 0}
							<a
								href="/api/albums/{album.id}/download"
								class="px-3.5 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold flex items-center gap-1"
							>
								<span>📦</span>
								<span>{t(locale, 'downloadZip')}</span>
							</a>
						{/if}
					</div>
				</div>

				{#if album.items.length > 0}
					<div class="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
						{#each album.items as item (item.id)}
							<a
								href={item.media.originalUrl}
								target="_blank"
								rel="noreferrer"
								class="group relative aspect-square rounded-2xl overflow-hidden bg-stone-900"
							>
								<img
									src={item.media.thumbUrl}
									alt={item.media.altText}
									loading="lazy"
									class="w-full h-full object-cover group-hover:scale-105 transition"
								/>
							</a>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-stone-400 italic py-4 text-center">
						No photos in this album yet. Click "+ Add Photos" to contribute!
					</p>
				{/if}
			</section>
		{/each}
	</div>
</div>
