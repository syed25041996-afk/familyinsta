<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	let displayName = $state('');
	let username = $state('');
	let email = $state('');
	let relationshipLabel = $state(data.invite?.defaultRelationshipLabel || 'Family');
	let password = $state('');
	let errorMsg = $state('');
	let loading = $state(false);

	async function handleSignup(e: Event) {
		e.preventDefault();
		errorMsg = '';
		loading = true;
		try {
			const res = await fetch('/api/auth/signup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					inviteCode: data.code,
					displayName,
					username,
					email,
					relationshipLabel,
					password
				})
			});
			const json = await res.json();
			if (!res.ok) {
				errorMsg = json.error || 'Could not complete signup.';
			} else {
				await invalidateAll();
				goto('/');
			}
		} catch {
			errorMsg = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="max-w-md mx-auto mt-6 bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 dark:border-stone-800">
	{#if !data.invite}
		<div class="text-center space-y-4">
			<div class="text-4xl">🔒</div>
			<h1 class="text-xl font-bold">Invite Code Expired or Already Used</h1>
			<p class="text-sm text-stone-500">
				The invite code <span class="font-mono font-bold">{data.code}</span> is no longer valid. Ask your family administrator for a fresh one-time invite link.
			</p>
			<a href="/login" class="inline-block px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm">
				Back to Sign In
			</a>
		</div>
	{:else}
		<div class="mb-6">
			<span class="inline-block px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 text-xs font-bold mb-2">
				🎟️ Invite Code: {data.invite.code} ({data.invite.assignedRole.toUpperCase()})
			</span>
			<h1 class="text-2xl font-extrabold">Welcome to the Family!</h1>
			{#if data.invite.note}
				<p class="text-sm text-stone-600 dark:text-stone-400 mt-1">"{data.invite.note}"</p>
			{/if}
		</div>

		{#if errorMsg}
			<div role="alert" class="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 text-red-700 dark:text-red-300 text-sm">
				{errorMsg}
			</div>
		{/if}

		<form onsubmit={handleSignup} class="space-y-4">
			<div>
				<label for="su-name" class="block text-sm font-semibold mb-1">Your Full / Family Name</label>
				<input
					id="su-name"
					type="text"
					required
					bind:value={displayName}
					placeholder="e.g. Meera Aunty"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="su-user" class="block text-sm font-semibold mb-1">Username</label>
					<input
						id="su-user"
						type="text"
						required
						bind:value={username}
						placeholder="meera"
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
					/>
				</div>
				<div>
					<label for="su-rel" class="block text-sm font-semibold mb-1">Family Relation</label>
					<input
						id="su-rel"
						type="text"
						required
						bind:value={relationshipLabel}
						placeholder="e.g. Mausi, Cousin"
						class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
					/>
				</div>
			</div>

			<div>
				<label for="su-email" class="block text-sm font-semibold mb-1">Email Address</label>
				<input
					id="su-email"
					type="email"
					required
					bind:value={email}
					placeholder="meera@family.local"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
				/>
			</div>

			<div>
				<label for="su-pass" class="block text-sm font-semibold mb-1">Create Password (min 8 chars)</label>
				<input
					id="su-pass"
					type="password"
					required
					minlength="8"
					bind:value={password}
					placeholder="••••••••"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm shadow-sm"
			>
				{loading ? 'Creating Account...' : 'Join Family Vault'}
			</button>
		</form>
	{/if}
</div>
