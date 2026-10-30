<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let token = $state($page.url.searchParams.get('token') || '');
	let newPassword = $state('');
	let message = $state('');
	let errorMsg = $state('');
	let loading = $state(false);

	async function handleReset(e: Event) {
		e.preventDefault();
		errorMsg = '';
		message = '';
		loading = true;
		try {
			const res = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, newPassword })
			});
			const json = await res.json();
			if (!res.ok) {
				errorMsg = json.error || 'Could not reset password.';
			} else {
				message = 'Password updated! Redirecting to login...';
				setTimeout(() => goto('/login'), 1500);
			}
		} catch {
			errorMsg = 'Network error.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="max-w-md mx-auto mt-8 bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 dark:border-stone-800">
	<h1 class="text-xl font-extrabold mb-1">Reset Your Password</h1>
	<p class="text-xs text-stone-500 mb-5">
		Paste the one-time reset token provided by your family admin (or email) and choose a new password.
	</p>

	{#if errorMsg}
		<div class="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-sm">
			{errorMsg}
		</div>
	{/if}
	{#if message}
		<div class="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-sm font-bold">
			{message}
		</div>
	{/if}

	<form onsubmit={handleReset} class="space-y-4">
		<div>
			<label for="rst-token" class="block text-sm font-semibold mb-1">One-Time Reset Token</label>
			<input
				id="rst-token"
				type="text"
				required
				bind:value={token}
				placeholder="Paste reset token"
				class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm font-mono"
			/>
		</div>
		<div>
			<label for="rst-pw" class="block text-sm font-semibold mb-1">New Password (min 8 chars)</label>
			<input
				id="rst-pw"
				type="password"
				required
				minlength="8"
				bind:value={newPassword}
				class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
			/>
		</div>
		<button
			type="submit"
			disabled={loading}
			class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm"
		>
			{loading ? 'Updating...' : 'Set New Password'}
		</button>
	</form>
</div>
