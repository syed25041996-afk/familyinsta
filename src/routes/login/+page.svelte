<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	let identifier = $state('');
	let password = $state('');
	let inviteCodeInput = $state('');
	let errorMsg = $state('');
	let loading = $state(false);

	async function handleLogin(e: Event) {
		e.preventDefault();
		errorMsg = '';
		loading = true;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ identifier, password })
			});
			const json = await res.json();
			if (!res.ok) {
				errorMsg = json.error || 'Login failed.';
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

	async function quickDemoLogin(username: string) {
		identifier = username;
		password = 'FamilyVault2026!';
		await handleLogin(new Event('submit'));
	}

	async function handlePasskeyLogin() {
		errorMsg = '';
		try {
			const optRes = await fetch('/api/auth/passkey?mode=login');
			const opts = await optRes.json();
			if (!window.PublicKeyCredential) {
				errorMsg = 'WebAuthn Passkeys are not supported in this browser.';
				return;
			}
			const challengeBytes = Uint8Array.from(atob(opts.challenge.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
				c.charCodeAt(0)
			);
			const cred = (await navigator.credentials.get({
				publicKey: {
					challenge: challengeBytes,
					rpId: window.location.hostname,
					userVerification: 'preferred'
				}
			})) as PublicKeyCredential | null;

			if (!cred) return;

			const verifyRes = await fetch('/api/auth/passkey', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'login',
					credentialId: cred.id
				})
			});
			const verifyJson = await verifyRes.json();
			if (!verifyRes.ok) {
				errorMsg = verifyJson.error || 'Passkey not recognized.';
			} else {
				await invalidateAll();
				goto('/');
			}
		} catch {
			errorMsg = 'No passkey found on this device yet. Log in with password first to register a passkey on your Profile.';
		}
	}
</script>

<div class="max-w-md mx-auto mt-4 sm:mt-8 space-y-6">
	<!-- Welcome Hero Card -->
	<div class="bg-white dark:bg-stone-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 dark:border-stone-800">
		<div class="text-center space-y-2 mb-6">
			<div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-3xl font-extrabold shadow-md">
				K
			</div>
			<h1 class="text-2xl font-extrabold tracking-tight">Kinship Family Vault</h1>
			<p class="text-sm text-stone-500 dark:text-stone-400">
				Private, invite-only family photos, stories & messages. Hosted at home — zero trackers, zero ads.
			</p>
		</div>

		{#if errorMsg}
			<div role="alert" class="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-medium">
				{errorMsg}
			</div>
		{/if}

		<form onsubmit={handleLogin} class="space-y-4">
			<div>
				<label for="login-id" class="block text-sm font-semibold mb-1">
					Username or Email
				</label>
				<input
					id="login-id"
					type="text"
					required
					bind:value={identifier}
					placeholder="e.g. aarav or nani@family.local"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
				/>
			</div>

			<div>
				<div class="flex items-center justify-between mb-1">
					<label for="login-pw" class="block text-sm font-semibold">Password</label>
					<a href="/reset-password" class="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">
						Have a reset token?
					</a>
				</div>
				<input
					id="login-pw"
					type="password"
					required
					bind:value={password}
					placeholder="••••••••"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2.5 text-sm"
				/>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold text-sm shadow-sm transition"
			>
				{loading ? 'Signing in...' : 'Sign In to Family Vault'}
			</button>
		</form>

		<div class="my-4 flex items-center gap-3">
			<div class="h-px flex-1 bg-stone-200 dark:bg-stone-800"></div>
			<span class="text-xs text-stone-400 uppercase font-semibold">Or</span>
			<div class="h-px flex-1 bg-stone-200 dark:bg-stone-800"></div>
		</div>

		<button
			type="button"
			onclick={handlePasskeyLogin}
			class="w-full py-2.5 px-4 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold text-sm flex items-center justify-center gap-2"
		>
			<span>🔑</span>
			<span>Sign in with Passkey / FaceID</span>
		</button>
	</div>

	<!-- Invite Code Entry Box -->
	<div class="bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-sm border border-stone-200 dark:border-stone-800">
		<h2 class="font-bold text-base mb-1">Invited by a family admin?</h2>
		<p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
			Enter your one-time family invite code to create your account.
		</p>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (inviteCodeInput.trim()) {
					goto(`/invite/${encodeURIComponent(inviteCodeInput.trim().toUpperCase())}`);
				}
			}}
			class="flex gap-2"
		>
			<input
				type="text"
				bind:value={inviteCodeInput}
				placeholder="e.g. DIWALI-2026"
				class="flex-1 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3.5 py-2 text-sm uppercase font-mono"
			/>
			<button
				type="submit"
				class="px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold text-sm"
			>
				Join
			</button>
		</form>

		{#if data.openInvites && data.openInvites.length > 0}
			<div class="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
				<span class="text-xs text-stone-500 block mb-1.5">Active Demo Invite Codes:</span>
				<div class="flex flex-wrap gap-1.5">
					{#each data.openInvites as inv}
						<a
							href="/invite/{inv.code}"
							class="text-xs font-mono px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800"
						>
							{inv.code} ({inv.defaultRelationshipLabel} · {inv.assignedRole})
						</a>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- One-Tap Family Demo Switcher -->
	{#if data.familyAccounts && data.familyAccounts.length > 0}
		<div class="bg-amber-50/80 dark:bg-stone-900/90 rounded-3xl p-5 border border-amber-200 dark:border-stone-800">
			<h3 class="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-2">
				⚡ Quick-Switch Family Demo Accounts (Password: FamilyVault2026!)
			</h3>
			<div class="grid grid-cols-2 gap-2">
				{#each data.familyAccounts as acc}
					<button
						type="button"
						onclick={() => quickDemoLogin(acc.username)}
						class="text-left p-2.5 rounded-xl bg-white dark:bg-stone-800 hover:border-brand-500 border border-amber-200/80 dark:border-stone-700 transition"
					>
						<div class="font-bold text-sm truncate">{acc.displayName}</div>
						<div class="text-xs text-stone-500 dark:text-stone-400 flex items-center justify-between mt-0.5">
							<span>{acc.relationshipLabel}</span>
							<span class="uppercase text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-700 font-semibold">
								{acc.role}
							</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
