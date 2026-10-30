<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n/index.js';

	let { data } = $props();
	let locale = $derived(data.user?.locale || 'en');
	let searchInput = $state(data.query || '');

	function handleSearch(e: Event) {
		e.preventDefault();
		goto(`/search?q=${encodeURIComponent(searchInput.trim())}`);
	}
</script>

<div class="space-y-6">
	<!-- Search Input Box -->
	<form onsubmit={handleSearch} class="flex gap-2">
		<input
			type="search"
			bind:value={searchInput}
			placeholder={t(locale, 'searchPlaceholder')}
			aria-label={t(locale, 'search')}
			class="flex-1 rounded-2xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-3 text-sm shadow-sm"
		/>
		<button
			type="submit"
			class="px-5 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm"
		>
			{t(locale, 'search')}
		</button>
	</form>

	<!-- Matching Hashtags -->
	{#if data.results.tags.length > 0}
		<section class="space-y-2">
			<h2 class="text-xs font-bold uppercase tracking-wider text-stone-500">Tags</h2>
			<div class="flex flex-wrap gap-2">
				{#each data.results.tags as tag}
					<a
						href="/search?q=%23{encodeURIComponent(tag)}"
						class="px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-bold"
					>
						#{tag}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Family Members -->
	{#if data.results.people.length > 0}
		<section class="space-y-2.5">
			<h2 class="text-xs font-bold uppercase tracking-wider text-stone-500">Family Members</h2>
			<div class="grid sm:grid-cols-2 gap-2.5">
				{#each data.results.people as person}
					<a
						href="/profile/{person.username}"
						class="flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-brand-500 transition"
					>
						{#if person.avatarUrl}
							<img
								src={person.avatarUrl}
								alt={person.displayName}
								class="w-12 h-12 rounded-full object-cover"
							/>
						{:else}
							<div class="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-bold flex items-center justify-center text-lg">
								{person.displayName.slice(0, 1)}
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="font-bold text-sm truncate">{person.displayName}</div>
							<div class="text-xs text-stone-500 truncate">@{person.username}</div>
							<span class="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800">
								{person.relationshipLabel}
							</span>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Matching Shared Albums -->
	{#if data.results.albums.length > 0}
		<section class="space-y-2.5">
			<h2 class="text-xs font-bold uppercase tracking-wider text-stone-500">Shared Albums</h2>
			<div class="grid sm:grid-cols-2 gap-3">
				{#each data.results.albums as alb}
					<a
						href="/albums"
						class="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center gap-3"
					>
						{#if alb.coverUrl}
							<img src={alb.coverUrl} alt={alb.title} class="w-14 h-14 rounded-xl object-cover" />
						{:else}
							<div class="w-14 h-14 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-2xl">
								🖼️
							</div>
						{/if}
						<div>
							<div class="font-bold text-sm">{alb.title}</div>
							<div class="text-xs text-stone-500">{alb.itemCount} items</div>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Matching Posts -->
	{#if data.results.posts.length > 0}
		<section class="space-y-2.5">
			<h2 class="text-xs font-bold uppercase tracking-wider text-stone-500">
				Matching Posts ({data.results.posts.length})
			</h2>
			<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
				{#each data.results.posts as post}
					<a
						href="/profile/{post.author.username}"
						class="group relative aspect-square rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 dark:border-stone-800"
					>
						{#if post.media[0]}
							<img
								src={post.media[0].thumbUrl}
								alt={post.media[0].altText}
								class="w-full h-full object-cover group-hover:scale-105 transition"
							/>
						{/if}
						<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 text-white">
							<div class="text-xs font-bold truncate">{post.author.displayName}</div>
							<p class="text-[11px] text-stone-200 truncate">{post.caption}</p>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
