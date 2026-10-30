<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();

	let locale = $derived(data.user?.locale || 'en');
	let feedPosts = $state(data.feed || []);
	let storiesTray = $state(data.storiesTray || []);
	let memories = $state(data.memories || []);

	$effect(() => {
		feedPosts = data.feed || [];
		storiesTray = data.storiesTray || [];
		memories = data.memories || [];
	});

	// Carousel index per postId
	let carouselIndex = $state<Record<string, number>>({});

	// Comment input & reply target per postId
	let commentInputs = $state<Record<string, string>>({});
	let replyToComment = $state<Record<string, { id: string; username: string } | null>>({});

	// Editing post state
	let editingPostId = $state<string | null>(null);
	let editingCaption = $state('');
	let editingLocation = $state('');

	// Active Story Viewer Modal state
	let activeStoryGroupIdx = $state<number | null>(null);
	let activeStoryItemIdx = $state(0);
	let showStoryViewers = $state(false);
	let highlightTitleInput = $state('Family Highlights');
	let savingHighlight = $state(false);
	let refreshing = $state(false);

	const EMOJIS = ['❤️', '😂', '😮', '🙏', '🎉'];

	async function refreshFeed() {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	}

	async function openStoryGroup(groupIdx: number) {
		activeStoryGroupIdx = groupIdx;
		activeStoryItemIdx = 0;
		showStoryViewers = false;
		const story = storiesTray[groupIdx]?.stories[0];
		if (story) {
			await fetch('/api/stories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'view', storyId: story.id })
			});
		}
	}

	async function nextStory() {
		if (activeStoryGroupIdx === null) return;
		const group = storiesTray[activeStoryGroupIdx];
		if (!group) return;

		if (activeStoryItemIdx + 1 < group.stories.length) {
			activeStoryItemIdx += 1;
			const st = group.stories[activeStoryItemIdx];
			await fetch('/api/stories', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'view', storyId: st.id })
			});
		} else if (activeStoryGroupIdx + 1 < storiesTray.length) {
			await openStoryGroup(activeStoryGroupIdx + 1);
		} else {
			activeStoryGroupIdx = null;
			await invalidateAll();
		}
	}

	async function saveCurrentStoryToHighlight() {
		if (activeStoryGroupIdx === null) return;
		const st = storiesTray[activeStoryGroupIdx]?.stories[activeStoryItemIdx];
		if (!st) return;
		savingHighlight = true;
		await fetch('/api/stories', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'save_highlight',
				storyId: st.id,
				title: highlightTitleInput || 'Highlights'
			})
		});
		savingHighlight = false;
		alert(`Saved to profile highlight "${highlightTitleInput}"!`);
	}

	async function toggleReaction(postId: string, emoji: string) {
		await fetch('/api/posts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'react', postId, emoji })
		});
		await invalidateAll();
	}

	async function submitComment(postId: string) {
		const text = (commentInputs[postId] || '').trim();
		if (!text) return;
		const parent = replyToComment[postId];

		await fetch('/api/posts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'comment',
				postId,
				body: text,
				parentCommentId: parent?.id || null
			})
		});

		commentInputs[postId] = '';
		replyToComment[postId] = null;
		await invalidateAll();
	}

	function startEditPost(post: (typeof feedPosts)[0]) {
		editingPostId = post.id;
		editingCaption = post.caption;
		editingLocation = post.locationName;
	}

	async function saveEditPost(postId: string) {
		await fetch(`/api/posts/${postId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				caption: editingCaption,
				locationName: editingLocation
			})
		});
		editingPostId = null;
		await invalidateAll();
	}

	async function deletePost(postId: string) {
		if (!confirm('Delete this post from the family feed?')) return;
		await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function reportPost(postId: string) {
		const reason = prompt('Reason for reporting this post to Family Admins:');
		if (!reason) return;
		await fetch('/api/posts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'report',
				targetType: 'post',
				targetId: postId,
				reason
			})
		});
		alert('Reported to family administrators.');
	}
</script>

<!-- Pull-to-refresh & Top Bar -->
<div class="flex items-center justify-between mb-3">
	<h1 class="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
		{t(locale, 'stories')}
	</h1>
	<button
		type="button"
		onclick={refreshFeed}
		class="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
	>
		<span>{refreshing ? '⏳' : '↻'}</span>
		<span>Refresh Feed</span>
	</button>
</div>

<!-- 1. 24-Hour Family Stories Bar -->
<section
	aria-label="24-Hour Family Stories"
	class="bg-white dark:bg-stone-900 rounded-2xl p-3.5 mb-5 border border-stone-200 dark:border-stone-800 shadow-sm overflow-x-auto no-scrollbar"
>
	<div class="flex items-center gap-4">
		<!-- Add Story Button -->
		<a href="/create?mode=story" class="flex flex-col items-center gap-1 shrink-0 group">
			<div class="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-800 border-2 border-dashed border-brand-400 flex items-center justify-center relative group-hover:scale-105 transition">
				{#if data.user?.avatarUrl}
					<img
						src={data.user.avatarUrl}
						alt={data.user.displayName}
						class="w-14 h-14 rounded-full object-cover opacity-80"
					/>
				{:else}
					<span class="text-2xl">📸</span>
				{/if}
				<span class="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shadow">
					+
				</span>
			</div>
			<span class="text-xs font-medium truncate max-w-[70px]">{t(locale, 'addStory')}</span>
		</a>

		<!-- Active Family Stories -->
		{#each storiesTray as group, idx}
			<button
				type="button"
				onclick={() => openStoryGroup(idx)}
				class="flex flex-col items-center gap-1 shrink-0 group"
			>
				<div
					class="w-16 h-16 rounded-full p-0.5 flex items-center justify-center transition group-hover:scale-105 {group.hasUnseen
						? 'bg-gradient-to-tr from-amber-500 via-brand-500 to-purple-600'
						: 'bg-stone-300 dark:bg-stone-700'}"
				>
					<div class="w-full h-full rounded-full bg-white dark:bg-stone-900 p-0.5 flex items-center justify-center">
						{#if group.author.avatarUrl}
							<img
								src={group.author.avatarUrl}
								alt={group.author.displayName}
								class="w-full h-full rounded-full object-cover"
							/>
						{:else}
							<span class="w-full h-full rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-bold flex items-center justify-center">
								{group.author.displayName.slice(0, 1)}
							</span>
						{/if}
					</div>
				</div>
				<span class="text-xs font-semibold truncate max-w-[74px]">
					{group.author.displayName.split(' ')[0]}
				</span>
				<span class="text-[10px] text-stone-400 -mt-1">{group.author.relationshipLabel}</span>
			</button>
		{/each}
	</div>
</section>

<!-- 2. "On This Day" Memories Section -->
{#if memories.length > 0}
	<section
		aria-label="On This Day Memories"
		class="mb-6 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 dark:from-stone-900 dark:via-stone-900 dark:to-stone-800 rounded-2xl p-4 border border-amber-200/80 dark:border-stone-700 shadow-sm"
	>
		<div class="flex items-center justify-between mb-2.5">
			<div>
				<h2 class="font-extrabold text-sm text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
					<span>✨</span>
					<span>{t(locale, 'onThisDay')}</span>
				</h2>
				<p class="text-xs text-stone-600 dark:text-stone-400">{t(locale, 'memoriesSubtitle')}</p>
			</div>
			<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-200/70 dark:bg-amber-950 text-amber-900 dark:text-amber-200">
				{memories[0].yearsAgo} {memories[0].yearsAgo === 1 ? 'Year Ago' : 'Years Ago'}
			</span>
		</div>

		<div class="flex gap-3 overflow-x-auto no-scrollbar pt-1">
			{#each memories as mem}
				<div class="w-56 shrink-0 bg-white dark:bg-stone-950 rounded-xl overflow-hidden border border-amber-200/60 dark:border-stone-800 shadow-sm">
					{#if mem.media[0]}
						<img
							src={mem.media[0].thumbUrl}
							alt={mem.media[0].altText}
							class="w-full h-36 object-cover"
						/>
					{/if}
					<div class="p-2.5">
						<div class="text-xs font-bold text-stone-800 dark:text-stone-200 truncate">
							{mem.author.displayName} ({mem.author.relationshipLabel})
						</div>
						<p class="text-xs text-stone-600 dark:text-stone-400 line-clamp-2 mt-0.5">
							{mem.caption}
						</p>
					</div>
				</div>
			{/each}
		</div>
	</section>
{/if}

<!-- 3. Chronological Family Feed -->
{#if feedPosts.length === 0}
	<div class="text-center py-16 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-8">
		<div class="text-4xl mb-3">🏡</div>
		<h2 class="text-lg font-bold mb-1">{t(locale, 'noPostsYet')}</h2>
		<a
			href="/create"
			class="inline-block mt-3 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm"
		>
			{t(locale, 'publishPost')}
		</a>
	</div>
{:else}
	<div class="space-y-6">
		{#each feedPosts as post (post.id)}
			{@const activeSlide = carouselIndex[post.id] || 0}
			{@const topComments = post.comments.filter((c) => !c.parentCommentId)}
			<article class="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
				<!-- Post Header -->
				<div class="p-4 flex items-center justify-between">
					<a href="/profile/{post.author.username}" class="flex items-center gap-3 group">
						{#if post.author.avatarUrl}
							<img
								src={post.author.avatarUrl}
								alt={post.author.displayName}
								class="w-10 h-10 rounded-full object-cover ring-2 ring-brand-100 dark:ring-brand-900"
							/>
						{:else}
							<div class="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-bold flex items-center justify-center">
								{post.author.displayName.slice(0, 1)}
							</div>
						{/if}
						<div>
							<div class="flex items-center gap-2">
								<span class="font-bold text-sm group-hover:underline">
									{post.author.displayName}
								</span>
								<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
									{post.author.relationshipLabel}
								</span>
							</div>
							<div class="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2">
								{#if post.locationName}
									<span>📍 {post.locationName}</span>
									<span>·</span>
								{/if}
								<time datetime={post.createdAt}>
									{new Date(post.createdAt).toLocaleDateString(undefined, {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}
								</time>
							</div>
						</div>
					</a>

					<!-- Author / Admin Actions -->
					<div class="flex items-center gap-1">
						{#if data.user && (data.user.id === post.author.id || data.user.role === 'admin')}
							<button
								type="button"
								onclick={() => startEditPost(post)}
								title="Edit Post"
								class="p-1.5 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-white rounded-lg"
							>
								✏️
							</button>
							<button
								type="button"
								onclick={() => deletePost(post.id)}
								title="Delete Post"
								class="p-1.5 text-xs text-stone-500 hover:text-red-600 rounded-lg"
							>
								🗑️
							</button>
						{/if}
						<button
							type="button"
							onclick={() => reportPost(post.id)}
							title="Report to Family Admin"
							class="p-1.5 text-xs text-stone-400 hover:text-amber-600 rounded-lg"
						>
							🚩
						</button>
					</div>
				</div>

				<!-- Media Carousel (Photos & Videos) -->
				{#if post.media.length > 0}
					{@const currentMedia = post.media[activeSlide] || post.media[0]}
					<div class="relative bg-stone-950 aspect-square sm:aspect-[4/3] flex items-center justify-center overflow-hidden">
						{#if currentMedia.type === 'video'}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								src={currentMedia.displayUrl}
								poster={currentMedia.thumbUrl}
								controls
								playsinline
								preload="metadata"
								class="w-full h-full object-contain"
							></video>
						{:else}
							<picture class="w-full h-full flex items-center justify-center">
								{#if currentMedia.avifUrl}
									<source srcset={currentMedia.avifUrl} type="image/avif" />
								{/if}
								<img
									src={currentMedia.displayUrl}
									alt={currentMedia.altText}
									loading="lazy"
									ondblclick={() => toggleReaction(post.id, '❤️')}
									class="w-full h-full object-cover"
								/>
							</picture>
						{/if}

						<!-- Multi-photo Carousel Controls -->
						{#if post.media.length > 1}
							<div class="absolute top-3 right-3 bg-black/60 text-white text-xs font-bold px-2.5 py-1 rounded-full">
								{activeSlide + 1} / {post.media.length}
							</div>
							{#if activeSlide > 0}
								<button
									type="button"
									aria-label="Previous photo"
									onclick={() => (carouselIndex[post.id] = activeSlide - 1)}
									class="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center font-bold"
								>
									‹
								</button>
							{/if}
							{#if activeSlide + 1 < post.media.length}
								<button
									type="button"
									aria-label="Next photo"
									onclick={() => (carouselIndex[post.id] = activeSlide + 1)}
									class="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center font-bold"
								>
									›
								</button>
							{/if}
						{/if}

						<!-- Optional EXIF Badge when keepExif=true -->
						{#if post.keepExif && currentMedia.exifData?.camera}
							<div class="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-0.5 rounded">
								📷 {currentMedia.exifData.camera}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Reactions Bar -->
				<div class="p-4 space-y-3">
					<div class="flex items-center justify-between flex-wrap gap-2">
						<div class="flex items-center gap-1.5">
							{#each EMOJIS as emoji}
								{@const count = post.reactionCounts[emoji] || 0}
								{@const isMine = post.myReaction === emoji}
								<button
									type="button"
									onclick={() => toggleReaction(post.id, emoji)}
									aria-label="React with {emoji}"
									class="px-2.5 py-1 rounded-full text-sm flex items-center gap-1 transition border {isMine
										? 'bg-brand-50 dark:bg-brand-950 border-brand-400 text-brand-700 dark:text-brand-300 font-bold scale-105'
										: 'bg-stone-100 dark:bg-stone-800 border-transparent hover:border-stone-300'}"
								>
									<span>{emoji}</span>
									{#if count > 0}
										<span class="text-xs">{count}</span>
									{/if}
								</button>
							{/each}
						</div>

						{#if post.media[activeSlide]}
							<a
								href={post.media[activeSlide].originalUrl}
								download
								class="text-xs text-stone-500 hover:text-brand-600 font-medium"
								title="Download original photo"
							>
								⬇ Original
							</a>
						{/if}
					</div>

					<!-- Caption or Edit Form -->
					{#if editingPostId === post.id}
						<div class="space-y-2 p-3 rounded-xl bg-stone-50 dark:bg-stone-800">
							<input
								type="text"
								bind:value={editingLocation}
								placeholder="Location"
								class="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs"
							/>
							<textarea
								rows="2"
								bind:value={editingCaption}
								class="w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1.5 text-sm"
							></textarea>
							<div class="flex gap-2 justify-end">
								<button
									type="button"
									onclick={() => (editingPostId = null)}
									class="px-3 py-1 rounded-lg text-xs bg-stone-200 dark:bg-stone-700"
								>
									Cancel
								</button>
								<button
									type="button"
									onclick={() => saveEditPost(post.id)}
									class="px-3 py-1 rounded-lg text-xs bg-brand-600 text-white font-bold"
								>
									Save
								</button>
							</div>
						</div>
					{:else if post.caption}
						<p class="text-sm leading-relaxed">
							<a href="/profile/{post.author.username}" class="font-bold mr-1.5 hover:underline">
								{post.author.displayName}
							</a>
							<span>{post.caption}</span>
						</p>
					{/if}

					<!-- Hashtag Pills -->
					{#if post.tags.length > 0}
						<div class="flex flex-wrap gap-1.5">
							{#each post.tags as tag}
								<a
									href="/search?q=%23{encodeURIComponent(tag)}"
									class="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
								>
									#{tag}
								</a>
							{/each}
						</div>
					{/if}

					<!-- Threaded Comments Section -->
					<div class="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-2">
						{#each topComments as comment (comment.id)}
							{@const replies = post.comments.filter((c) => c.parentCommentId === comment.id)}
							<div class="text-xs sm:text-sm space-y-1">
								<div class="flex items-start justify-between gap-2">
									<div>
										<a href="/profile/{comment.author.username}" class="font-bold mr-1.5 hover:underline">
											{comment.author.displayName}
										</a>
										<span class="text-[10px] text-stone-400 mr-1.5">({comment.author.relationshipLabel})</span>
										<span>{comment.body}</span>
									</div>
									<button
										type="button"
										onclick={() =>
											(replyToComment[post.id] = {
												id: comment.id,
												username: comment.author.username
											})}
										class="text-[11px] text-stone-400 hover:text-brand-600 shrink-0"
									>
										{t(locale, 'reply')}
									</button>
								</div>

								<!-- Nested Threaded Replies -->
								{#if replies.length > 0}
									<div class="pl-4 border-l-2 border-stone-200 dark:border-stone-700 space-y-1 mt-1">
										{#each replies as reply (reply.id)}
											<div class="text-xs">
												<a href="/profile/{reply.author.username}" class="font-bold mr-1 hover:underline">
													{reply.author.displayName}
												</a>
												<span>{reply.body}</span>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}

						<!-- Add Comment Input -->
						{#if replyToComment[post.id]}
							<div class="flex items-center justify-between text-xs bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-lg">
								<span>Replying to @{replyToComment[post.id]?.username}</span>
								<button type="button" onclick={() => (replyToComment[post.id] = null)}>✕</button>
							</div>
						{/if}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								submitComment(post.id);
							}}
							class="flex gap-2 pt-1"
						>
							<input
								type="text"
								bind:value={commentInputs[post.id]}
								placeholder={t(locale, 'addComment')}
								aria-label={t(locale, 'addComment')}
								class="flex-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-xs sm:text-sm"
							/>
							<button
								type="submit"
								class="px-3.5 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold"
							>
								Post
							</button>
						</form>
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}

<!-- Full-Screen 24h Story Viewer Modal -->
{#if activeStoryGroupIdx !== null && storiesTray[activeStoryGroupIdx]}
	{@const group = storiesTray[activeStoryGroupIdx]}
	{@const activeStory = group.stories[activeStoryItemIdx] || group.stories[0]}
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Family Story Viewer"
		class="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 text-white"
	>
		<!-- Progress Bars & Story Author -->
		<div class="max-w-md w-full mx-auto space-y-3">
			<div class="flex gap-1.5">
				{#each group.stories as st, i}
					<div class="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
						<div
							class="h-full bg-white transition-all {i <= activeStoryItemIdx ? 'w-full' : 'w-0'}"
						></div>
					</div>
				{/each}
			</div>

			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2.5">
					<div class="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center font-bold">
						{group.author.displayName.slice(0, 1)}
					</div>
					<div>
						<div class="font-bold text-sm">{group.author.displayName}</div>
						<div class="text-xs text-stone-300">{group.author.relationshipLabel}</div>
					</div>
				</div>
				<button
					type="button"
					onclick={() => (activeStoryGroupIdx = null)}
					class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
				>
					✕
				</button>
			</div>
		</div>

		<!-- Story Media & Tap to Advance -->
		<div class="flex-1 max-w-md w-full mx-auto my-3 relative flex items-center justify-center overflow-hidden rounded-2xl bg-stone-900">
			{#if activeStory.media.type === 'video'}
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					src={activeStory.media.displayUrl}
					autoplay
					controls
					playsinline
					class="w-full h-full object-contain"
				></video>
			{:else}
				<img
					src={activeStory.media.displayUrl}
					alt={activeStory.media.altText}
					class="w-full h-full object-contain"
				/>
			{/if}

			{#if activeStory.caption}
				<div class="absolute bottom-4 inset-x-4 bg-black/70 backdrop-blur p-3 rounded-xl text-center text-sm">
					{activeStory.caption}
				</div>
			{/if}
		</div>

		<!-- Bottom Controls: Viewers List, Save to Highlights & Next -->
		<div class="max-w-md w-full mx-auto space-y-2">
			<div class="flex items-center justify-between gap-2">
				<button
					type="button"
					onclick={() => (showStoryViewers = !showStoryViewers)}
					class="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold"
				>
					👁️ {t(locale, 'viewers')} ({activeStory.viewers.length})
				</button>

				{#if data.user?.id === group.author.id}
					<div class="flex items-center gap-1.5">
						<input
							type="text"
							bind:value={highlightTitleInput}
							placeholder="Highlight name"
							class="px-2.5 py-1.5 rounded-lg bg-white/10 text-xs text-white border border-white/20 w-32"
						/>
						<button
							type="button"
							disabled={savingHighlight}
							onclick={saveCurrentStoryToHighlight}
							class="px-3 py-1.5 rounded-lg bg-amber-500 text-stone-950 text-xs font-bold"
						>
							⭐ {t(locale, 'saveToHighlights')}
						</button>
					</div>
				{/if}

				<button
					type="button"
					onclick={nextStory}
					class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-xs font-bold"
				>
					Next →
				</button>
			</div>

			{#if showStoryViewers}
				<div class="bg-stone-900/95 border border-white/15 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5">
					{#if activeStory.viewers.length === 0}
						<p class="text-xs text-stone-400">No views yet.</p>
					{:else}
						{#each activeStory.viewers as v}
							<div class="flex items-center justify-between text-xs">
								<span class="font-semibold">{v.displayName} ({v.relationshipLabel})</span>
								<span class="text-stone-400">{new Date(v.viewedAt).toLocaleTimeString()}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
