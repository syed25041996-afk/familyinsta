<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t, LOCALE_NAMES, type LocaleCode } from '$lib/i18n/index.js';

	let { data, children } = $props();

	let currentTheme = $state<'light' | 'dark'>('light');
	let currentScale = $state<'normal' | 'large' | 'xlarge'>('normal');
	let currentLocale = $state<LocaleCode>('en');
	let liveUnreadCount = $state(0);

	$effect(() => {
		liveUnreadCount = data.unreadNotificationsCount || 0;
		if (data.user) {
			currentLocale = data.user.locale || 'en';
			currentScale = data.user.textScale || 'normal';
			if (data.user.theme === 'dark') currentTheme = 'dark';
			else if (data.user.theme === 'light') currentTheme = 'light';
		}
	});

	onMount(() => {
		const savedTheme = localStorage.getItem('kinship_theme') as 'light' | 'dark' | null;
		const savedScale = localStorage.getItem('kinship_scale') as
			| 'normal'
			| 'large'
			| 'xlarge'
			| null;
		const savedLocale = localStorage.getItem('kinship_locale') as LocaleCode | null;

		if (savedTheme) currentTheme = savedTheme;
		else if (window.matchMedia('(prefers-color-scheme: dark)').matches) currentTheme = 'dark';

		if (savedScale) currentScale = savedScale;
		if (savedLocale) currentLocale = savedLocale;

		applyAppearance();

		// Connect real-time WebSocket if logged in
		let ws: WebSocket | null = null;
		if (data.user) {
			const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			try {
				ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
				ws.onmessage = (ev) => {
					try {
						const msg = JSON.parse(ev.data);
						if (msg.type === 'notification:new') {
							liveUnreadCount += 1;
						}
						window.dispatchEvent(new CustomEvent('kinship:ws', { detail: msg }));
					} catch {
						// ignore
					}
				};
			} catch {
				// WebSocket optional in dev mode
			}
		}

		return () => {
			ws?.close();
		};
	});

	function applyAppearance() {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		html.classList.toggle('dark', currentTheme === 'dark');
		html.classList.remove('text-scale-normal', 'text-scale-large', 'text-scale-xlarge');
		html.classList.add(`text-scale-${currentScale}`);
	}

	async function toggleTheme() {
		currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
		localStorage.setItem('kinship_theme', currentTheme);
		applyAppearance();
		if (data.user) {
			await fetch('/api/users/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ theme: currentTheme })
			});
		}
	}

	async function cycleTextScale() {
		const order: Array<'normal' | 'large' | 'xlarge'> = ['normal', 'large', 'xlarge'];
		const next = order[(order.indexOf(currentScale) + 1) % order.length];
		currentScale = next;
		localStorage.setItem('kinship_scale', currentScale);
		applyAppearance();
		if (data.user) {
			await fetch('/api/users/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ textScale: currentScale })
			});
		}
	}

	async function changeLocale(newLocale: LocaleCode) {
		currentLocale = newLocale;
		localStorage.setItem('kinship_locale', currentLocale);
		if (data.user) {
			await fetch('/api/users/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ locale: currentLocale })
			});
			await invalidateAll();
		}
	}

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await invalidateAll();
		goto('/login');
	}
</script>

<div class="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
	<!-- Top Navigation Bar -->
	<header class="sticky top-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur border-b border-stone-200 dark:border-stone-800">
		<div class="max-w-2xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
			<!-- Brand Logo -->
			<a href="/" class="flex items-center gap-2.5 group" aria-label={t(currentLocale, 'home')}>
				<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold shadow-sm">
					K
				</div>
				<div>
					<span class="font-bold text-lg tracking-tight block leading-none">
						{t(currentLocale, 'appName')}
					</span>
					<span class="text-[11px] text-stone-500 dark:text-stone-400 block">
						{t(currentLocale, 'familyVault')}
					</span>
				</div>
			</a>

			<!-- Right Controls: Language, Text Size, Theme, Albums, Messages, Admin -->
			<div class="flex items-center gap-1.5 sm:gap-2">
				<!-- Language Selector -->
				<select
					aria-label={t(currentLocale, 'language')}
					value={currentLocale}
					onchange={(e) => changeLocale((e.currentTarget as HTMLSelectElement).value as LocaleCode)}
					class="text-xs bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 font-medium"
				>
					{#each Object.entries(LOCALE_NAMES) as [code, label]}
						<option value={code}>{label}</option>
					{/each}
				</select>

				<!-- Elder-Friendly Text Size Toggle -->
				<button
					type="button"
					onclick={cycleTextScale}
					title="Change readable text size (Normal / Large / Extra Large)"
					class="px-2 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-bold border border-stone-200 dark:border-stone-700"
				>
					{currentScale === 'normal' ? 'A' : currentScale === 'large' ? 'A+' : 'A++'}
				</button>

				<!-- Dark/Light Theme Toggle -->
				<button
					type="button"
					onclick={toggleTheme}
					aria-label={currentTheme === 'dark' ? t(currentLocale, 'lightMode') : t(currentLocale, 'darkMode')}
					class="p-2 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-sm"
				>
					{currentTheme === 'dark' ? '☀️' : '🌙'}
				</button>

				{#if data.user}
					<!-- Shared Albums Link -->
					<a
						href="/albums"
						title={t(currentLocale, 'albums')}
						class="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 relative"
						class:text-brand-600={$page.url.pathname.startsWith('/albums')}
					>
						🖼️
					</a>

					<!-- Direct & Group Messages Link -->
					<a
						href="/messages"
						title={t(currentLocale, 'messages')}
						class="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 relative"
						class:text-brand-600={$page.url.pathname.startsWith('/messages')}
					>
						💬
					</a>

					{#if data.user.role === 'admin'}
						<a
							href="/admin"
							title={t(currentLocale, 'admin')}
							class="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-300 dark:border-amber-800"
						>
							🛡️ {t(currentLocale, 'admin')}
						</a>
					{/if}

					<button
						type="button"
						onclick={handleLogout}
						title={t(currentLocale, 'logout')}
						class="text-xs text-stone-500 hover:text-red-600 px-1.5 py-1"
					>
						↪
					</button>
				{/if}
			</div>
		</div>

		{#if data.user?.role === 'child'}
			<div class="bg-emerald-50 dark:bg-emerald-950/60 border-t border-emerald-200 dark:border-emerald-800 px-4 py-1 text-center text-xs text-emerald-800 dark:text-emerald-200 font-medium">
				🌱 {t(currentLocale, 'childModeBadge')}: {t(currentLocale, 'childCircleInfo')}
			</div>
		{/if}
	</header>

	<!-- Main Content Container -->
	<main class="flex-1 max-w-2xl w-full mx-auto px-3 sm:px-4 pt-4 pb-24">
		{@render children()}
	</main>

	<!-- Mobile-First Instagram-Style Bottom Navigation Bar -->
	{#if data.user}
		<nav
			aria-label="Primary Bottom Navigation"
			class="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur border-t border-stone-200 dark:border-stone-800 pb-safe"
		>
			<div class="max-w-2xl mx-auto h-16 grid grid-cols-5 items-center">
				<a
					href="/"
					class="flex flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium {$page.url.pathname === '/' ? 'text-brand-600 dark:text-brand-400 font-bold' : 'text-stone-600 dark:text-stone-400'}"
				>
					<span class="text-xl">🏠</span>
					<span>{t(currentLocale, 'home')}</span>
				</a>

				<a
					href="/search"
					class="flex flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium {$page.url.pathname.startsWith('/search') ? 'text-brand-600 dark:text-brand-400 font-bold' : 'text-stone-600 dark:text-stone-400'}"
				>
					<span class="text-xl">🔍</span>
					<span>{t(currentLocale, 'search')}</span>
				</a>

				<a
					href="/create"
					class="flex flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium"
				>
					<span class="w-10 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center text-xl font-bold shadow-md">
						＋
					</span>
				</a>

				<a
					href="/activity"
					class="relative flex flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium {$page.url.pathname.startsWith('/activity') ? 'text-brand-600 dark:text-brand-400 font-bold' : 'text-stone-600 dark:text-stone-400'}"
				>
					<span class="text-xl relative">
						❤️
						{#if liveUnreadCount > 0}
							<span class="absolute -top-1 -right-2.5 bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
								{liveUnreadCount}
							</span>
						{/if}
					</span>
					<span>{t(currentLocale, 'activity')}</span>
				</a>

				<a
					href="/profile/{data.user.username}"
					class="flex flex-col items-center justify-center gap-0.5 py-1 text-xs font-medium {$page.url.pathname.startsWith('/profile') ? 'text-brand-600 dark:text-brand-400 font-bold' : 'text-stone-600 dark:text-stone-400'}"
				>
					{#if data.user.avatarUrl}
						<img
							src={data.user.avatarUrl}
							alt={data.user.displayName}
							class="w-6 h-6 rounded-full object-cover ring-2 {$page.url.pathname.startsWith('/profile') ? 'ring-brand-600' : 'ring-transparent'}"
						/>
					{:else}
						<span class="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center text-xs font-bold">
							{data.user.displayName.slice(0, 1).toUpperCase()}
						</span>
					{/if}
					<span>{t(currentLocale, 'profile')}</span>
				</a>
			</div>
		</nav>
	{/if}
</div>
