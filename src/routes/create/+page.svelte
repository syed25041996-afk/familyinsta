<script lang="ts">
	import { page } from '$app/stores';
	import { goto, invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();

	let locale = $derived(data.user?.locale || 'en');
	let shareMode = $state<'post' | 'story'>(
		$page.url.searchParams.get('mode') === 'story' ? 'story' : 'post'
	);

	interface UploadedMedia {
		id: string;
		type: 'image' | 'video';
		thumbUrl: string;
		displayUrl: string;
		altText: string;
	}

	let uploadedItems = $state<UploadedMedia[]>([]);
	let caption = $state('');
	let locationName = $state('');
	let altTextInput = $state('');
	let keepExif = $state(false);
	let uploadProgress = $state(0);
	let isUploading = $state(false);
	let isPublishing = $state(false);
	let errorMsg = $state('');

	const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks for resumable upload

	async function handleFilesSelected(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		errorMsg = '';
		isUploading = true;
		uploadProgress = 0;

		try {
			const fileArray = Array.from(files);
			for (let fIdx = 0; fIdx < fileArray.length; fIdx++) {
				const file = fileArray[fIdx];
				const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

				// 1. Initialize chunked upload session
				const initRes = await fetch('/api/media/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'init',
						filename: file.name,
						mimeType: file.type || 'image/jpeg',
						totalSizeBytes: file.size,
						totalChunks,
						keepExif,
						altText: altTextInput || file.name.replace(/\.[^.]+$/, '')
					})
				});
				const initJson = await initRes.json();
				if (!initRes.ok) {
					throw new Error(initJson.error || 'Failed to initialize upload');
				}

				const { uploadId } = initJson;

				// 2. Upload chunks sequentially with progress tracking
				for (let c = 0; c < totalChunks; c++) {
					const start = c * CHUNK_SIZE;
					const end = Math.min(file.size, start + CHUNK_SIZE);
					const slice = file.slice(start, end);

					const chunkRes = await fetch(
						`/api/media/upload?uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${c}`,
						{
							method: 'PATCH',
							headers: { 'Content-Type': 'application/octet-stream' },
							body: slice
						}
					);
					if (!chunkRes.ok) {
						throw new Error(`Failed uploading chunk ${c + 1}/${totalChunks}`);
					}

					const overallProgress =
						((fIdx + (c + 1) / totalChunks) / fileArray.length) * 90;
					uploadProgress = Math.round(overallProgress);
				}

				// 3. Complete & trigger WebP/AVIF/MP4 processing
				const completeRes = await fetch('/api/media/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'complete',
						uploadId
					})
				});
				const completeJson = await completeRes.json();
				if (!completeRes.ok) {
					throw new Error(completeJson.error || 'Failed to finalize media');
				}

				uploadedItems.push(completeJson.media);
			}
			uploadProgress = 100;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			isUploading = false;
			input.value = '';
		}
	}

	function removeMedia(id: string) {
		uploadedItems = uploadedItems.filter((m) => m.id !== id);
	}

	async function handlePublish(e: Event) {
		e.preventDefault();
		if (uploadedItems.length === 0) {
			errorMsg = 'Please upload at least one photo or video first.';
			return;
		}

		isPublishing = true;
		errorMsg = '';
		try {
			if (shareMode === 'story') {
				const res = await fetch('/api/stories', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'create',
						mediaId: uploadedItems[0].id,
						caption
					})
				});
				if (!res.ok) throw new Error('Could not publish story.');
			} else {
				const res = await fetch('/api/posts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'create',
						mediaIds: uploadedItems.map((m) => m.id),
						caption,
						locationName,
						keepExif
					})
				});
				if (!res.ok) throw new Error('Could not publish post.');
			}

			await invalidateAll();
			goto('/');
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Publish failed';
		} finally {
			isPublishing = false;
		}
	}
</script>

<div class="bg-white dark:bg-stone-900 rounded-3xl p-5 sm:p-6 border border-stone-200 dark:border-stone-800 shadow-sm space-y-5">
	<!-- Mode Switcher: Feed Post vs 24h Story -->
	<div class="flex rounded-2xl bg-stone-100 dark:bg-stone-800 p-1">
		<button
			type="button"
			onclick={() => (shareMode = 'post')}
			class="flex-1 py-2 rounded-xl text-sm font-bold transition {shareMode === 'post'
				? 'bg-white dark:bg-stone-900 shadow-sm text-brand-600'
				: 'text-stone-500'}"
		>
			🖼️ Family Feed Post
		</button>
		<button
			type="button"
			onclick={() => (shareMode = 'story')}
			class="flex-1 py-2 rounded-xl text-sm font-bold transition {shareMode === 'story'
				? 'bg-white dark:bg-stone-900 shadow-sm text-brand-600'
				: 'text-stone-500'}"
		>
			⏱️ 24-Hour Story
		</button>
	</div>

	{#if errorMsg}
		<div role="alert" class="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 text-red-700 dark:text-red-300 text-sm">
			{errorMsg}
		</div>
	{/if}

	<!-- Accessibility Alt Text & EXIF Options Before Upload -->
	<div class="grid sm:grid-cols-2 gap-3">
		<div>
			<label for="alt-input" class="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
				{t(locale, 'altTextPrompt')}
			</label>
			<input
				id="alt-input"
				type="text"
				bind:value={altTextInput}
				placeholder="e.g. Grandma smiling with Diwali lamps"
				class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs"
			/>
		</div>

		{#if data.user?.role !== 'child'}
			<div class="flex items-center pt-4">
				<label class="flex items-center gap-2 text-xs font-medium cursor-pointer">
					<input
						type="checkbox"
						bind:checked={keepExif}
						class="rounded text-brand-600 focus:ring-brand-500"
					/>
					<span>{t(locale, 'keepExifLabel')} (GPS stripped by default)</span>
				</label>
			</div>
		{/if}
	</div>

	<!-- Chunked File Uploader Dropzone -->
	<div class="border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-2xl p-6 text-center hover:border-brand-500 transition">
		<label class="cursor-pointer block space-y-2">
			<div class="text-3xl">📤</div>
			<div class="font-bold text-sm">
				Select Photos or Videos (Resumable Chunked Upload)
			</div>
			<div class="text-xs text-stone-500">
				Originals stored safely; WebP, AVIF & H.264 MP4 generated automatically.
			</div>
			<input
				type="file"
				multiple={shareMode === 'post'}
				accept="image/*,video/*"
				onchange={handleFilesSelected}
				class="hidden"
			/>
			<span class="inline-block mt-2 px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold">
				Choose Files
			</span>
		</label>

		{#if isUploading}
			<div class="mt-4 space-y-1">
				<div class="h-2.5 w-full bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
					<div
						class="h-full bg-brand-600 transition-all"
						style="width: {uploadProgress}%"
					></div>
				</div>
				<p class="text-xs font-semibold text-brand-600">
					Uploading & optimizing media... {uploadProgress}%
				</p>
			</div>
		{/if}
	</div>

	<!-- Preview Uploaded Items -->
	{#if uploadedItems.length > 0}
		<div class="grid grid-cols-3 gap-3">
			{#each uploadedItems as item (item.id)}
				<div class="relative rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 aspect-square bg-stone-950">
					<img
						src={item.thumbUrl}
						alt={item.altText}
						class="w-full h-full object-cover"
					/>
					<button
						type="button"
						onclick={() => removeMedia(item.id)}
						class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white text-xs font-bold"
					>
						✕
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<form onsubmit={handlePublish} class="space-y-4">
		<div>
			<label for="post-caption" class="block text-sm font-semibold mb-1">Caption</label>
			<textarea
				id="post-caption"
				rows="3"
				bind:value={caption}
				placeholder={t(locale, 'writeCaption')}
				class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
			></textarea>
		</div>

		{#if shareMode === 'post'}
			<div>
				<label for="post-loc" class="block text-sm font-semibold mb-1">
					{t(locale, 'locationOptional')}
				</label>
				<input
					id="post-loc"
					type="text"
					bind:value={locationName}
					placeholder="e.g. Nani's Terrace, Mysuru"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2 text-sm"
				/>
			</div>
		{/if}

		<button
			type="submit"
			disabled={isPublishing || isUploading || uploadedItems.length === 0}
			class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm shadow-sm"
		>
			{isPublishing
				? 'Sharing...'
				: shareMode === 'story'
					? t(locale, 'publishStory')
					: t(locale, 'publishPost')}
		</button>
	</form>
</div>
