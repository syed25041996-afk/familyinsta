<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let inviteRole = $state<'member' | 'child' | 'admin'>('member');
	let inviteRelation = $state('Cousin');
	let inviteNote = $state('Welcome to our private family vault!');
	let generatedResetLink = $state('');
	let selectedChildId = $state('');
	let selectedContactId = $state('');
	let runningBackup = $state(false);

	let childUsers = $derived(data.users.filter((u) => u.role === 'child'));

	async function createInvite(e: Event) {
		e.preventDefault();
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'create_invite',
				assignedRole: inviteRole,
				defaultRelationshipLabel: inviteRelation,
				note: inviteNote
			})
		});
		await invalidateAll();
	}

	async function revokeInvite(inviteId: string) {
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'revoke_invite', inviteId })
		});
		await invalidateAll();
	}

	async function updateUserRole(userId: string, role: string) {
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'update_user', userId, role })
		});
		await invalidateAll();
	}

	async function toggleUserActive(userId: string, isActive: boolean) {
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'update_user', userId, isActive })
		});
		await invalidateAll();
	}

	async function createResetToken(userId: string) {
		const res = await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'create_reset_token', userId })
		});
		const json = await res.json();
		if (res.ok) {
			generatedResetLink = `${window.location.origin}${json.resetUrl}`;
		}
	}

	async function approveChildContact(e: Event) {
		e.preventDefault();
		if (!selectedChildId || !selectedContactId) return;
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'approve_child_contact',
				childUserId: selectedChildId,
				contactUserId: selectedContactId
			})
		});
		await invalidateAll();
	}

	async function resolveReport(reportId: string, decision: 'resolved' | 'dismissed', deleteContent: boolean) {
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'resolve_report',
				reportId,
				decision,
				deleteContent
			})
		});
		await invalidateAll();
	}

	async function triggerBackupNow() {
		runningBackup = true;
		await fetch('/api/admin', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'trigger_backup' })
		});
		runningBackup = false;
		await invalidateAll();
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-extrabold">🛡️ Home Lab Family Admin Panel</h1>
		<p class="text-xs text-stone-500">
			Manage family invites, roles, Child safety circles, Proxmox VM storage, moderation, and backups.
		</p>
	</div>

	<!-- 1. Proxmox 200 GB VM Storage Gauge & Backup Trigger -->
	<div class="grid sm:grid-cols-2 gap-4">
		<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="font-bold text-sm">💾 Proxmox VM Storage Usage</h2>
				<span class="text-xs font-mono font-bold text-brand-600">
					{data.storage.usedMb} MB / {data.storage.quotaGb} GB
				</span>
			</div>
			<div class="h-3 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
				<div
					class="h-full bg-brand-600 transition-all"
					style="width: {Math.max(2, data.storage.percentUsed)}%"
				></div>
			</div>
			<p class="text-xs text-stone-500">
				{data.storage.mediaCount} family photos & videos stored locally (originals + WebP/AVIF/MP4).
			</p>
		</section>

		<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="font-bold text-sm">📦 Automated & Manual Backups</h2>
				<button
					type="button"
					disabled={runningBackup}
					onclick={triggerBackupNow}
					class="px-3 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-bold"
				>
					{runningBackup ? '⏳ Backing up...' : 'Run Backup Now'}
				</button>
			</div>
			{#if data.backups.length > 0}
				<p class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
					✓ Latest: {data.backups[0].archiveName} ({Math.round(data.backups[0].sizeBytes / 1024)} KB)
				</p>
			{:else}
				<p class="text-xs text-stone-500">Nightly cron scheduled at 02:00 AM.</p>
			{/if}
		</section>
	</div>

	<!-- 2. One-Time Family Invite Generator -->
	<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
		<h2 class="font-bold text-sm">🎟️ Generate One-Time Family Invite</h2>
		<form onsubmit={createInvite} class="grid sm:grid-cols-4 gap-3">
			<div>
				<label for="inv-rel" class="block text-xs font-semibold mb-1">Relationship Label</label>
				<input
					id="inv-rel"
					type="text"
					required
					bind:value={inviteRelation}
					placeholder="e.g. Nani, Chacha"
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs"
				/>
			</div>
			<div>
				<label for="inv-role" class="block text-xs font-semibold mb-1">Role</label>
				<select
					id="inv-role"
					bind:value={inviteRole}
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs"
				>
					<option value="member">Member (Standard)</option>
					<option value="child">Child (Restricted Circle)</option>
					<option value="admin">Admin</option>
				</select>
			</div>
			<div>
				<label for="inv-note" class="block text-xs font-semibold mb-1">Welcome Note</label>
				<input
					id="inv-note"
					type="text"
					bind:value={inviteNote}
					class="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs"
				/>
			</div>
			<div class="flex items-end">
				<button
					type="submit"
					class="w-full py-2 px-4 rounded-xl bg-brand-600 text-white font-bold text-xs"
				>
					+ Create Invite Code
				</button>
			</div>
		</form>

		<div class="divide-y divide-stone-100 dark:divide-stone-800">
			{#each data.invites as inv (inv.id)}
				<div class="py-2.5 flex items-center justify-between text-xs">
					<div>
						<span class="font-mono font-bold text-brand-600 dark:text-brand-400 mr-2">
							{inv.code}
						</span>
						<span class="font-semibold">{inv.defaultRelationshipLabel}</span>
						<span class="text-stone-400 ml-1">({inv.assignedRole})</span>
						{#if inv.claimedById}
							<span class="ml-2 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700">
								Claimed
							</span>
						{/if}
					</div>
					<div class="flex items-center gap-2">
						<a
							href="/invite/{inv.code}"
							class="text-brand-600 hover:underline font-medium"
						>
							/invite/{inv.code}
						</a>
						<button
							type="button"
							onclick={() => revokeInvite(inv.id)}
							class="text-red-600 hover:underline"
						>
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- 3. Family Members, Roles & Password Reset Generator -->
	<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
		<h2 class="font-bold text-sm">👨‍👩‍👧‍👦 Family Accounts ({data.users.length})</h2>

		{#if generatedResetLink}
			<div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-200 text-xs space-y-1">
				<div class="font-bold">One-Time Password Reset Link Generated:</div>
				<div class="font-mono break-all select-all">{generatedResetLink}</div>
			</div>
		{/if}

		<div class="divide-y divide-stone-100 dark:divide-stone-800">
			{#each data.users as u (u.id)}
				<div class="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
					<div>
						<span class="font-bold text-sm">{u.displayName}</span>
						<span class="text-stone-400 ml-1">(@{u.username})</span>
						<span class="ml-2 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 font-semibold">
							{u.relationshipLabel}
						</span>
					</div>

					<div class="flex items-center gap-2">
						<select
							value={u.role}
							onchange={(e) =>
								updateUserRole(u.id, (e.currentTarget as HTMLSelectElement).value)}
							class="rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2 py-1 text-xs"
						>
							<option value="admin">admin</option>
							<option value="member">member</option>
							<option value="child">child</option>
						</select>

						<button
							type="button"
							onclick={() => createResetToken(u.id)}
							class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 font-semibold"
						>
							🔑 Reset PW
						</button>

						{#if u.id !== data.user?.id}
							<button
								type="button"
								onclick={() => toggleUserActive(u.id, !u.isActive)}
								class="px-2.5 py-1 rounded-lg font-semibold {u.isActive
									? 'bg-red-50 text-red-700'
									: 'bg-emerald-50 text-emerald-700'}"
							>
								{u.isActive ? 'Deactivate' : 'Activate'}
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- 4. Child Safety Circle Approval Manager -->
	{#if childUsers.length > 0}
		<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
			<h2 class="font-bold text-sm">🌱 Child Account Approved Contacts Circle</h2>
			<form onsubmit={approveChildContact} class="grid sm:grid-cols-3 gap-3">
				<select
					bind:value={selectedChildId}
					class="rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs"
				>
					<option value="">Select Child Account...</option>
					{#each childUsers as ch}
						<option value={ch.id}>{ch.displayName} (@{ch.username})</option>
					{/each}
				</select>

				<select
					bind:value={selectedContactId}
					class="rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs"
				>
					<option value="">Select Relative to Approve...</option>
					{#each data.users as rel}
						<option value={rel.id}>{rel.displayName} ({rel.relationshipLabel})</option>
					{/each}
				</select>

				<button
					type="submit"
					class="py-2 px-4 rounded-xl bg-emerald-600 text-white font-bold text-xs"
				>
					✓ Approve Contact for Child
				</button>
			</form>
		</section>
	{/if}

	<!-- 5. Content Moderation Reports -->
	<section class="bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 shadow-sm space-y-3">
		<h2 class="font-bold text-sm">🚩 Reported Content Queue ({data.reports.length})</h2>
		{#if data.reports.length === 0}
			<p class="text-xs text-stone-500">No reported posts or comments.</p>
		{:else}
			<div class="divide-y divide-stone-100 dark:divide-stone-800">
				{#each data.reports as rep (rep.id)}
					<div class="py-2.5 flex items-center justify-between text-xs">
						<div>
							<span class="uppercase font-bold mr-2">[{rep.targetType}]</span>
							<span>{rep.reason}</span>
							<span class="ml-2 text-stone-400">({rep.status})</span>
						</div>
						{#if rep.status === 'open'}
							<div class="flex gap-2">
								<button
									type="button"
									onclick={() => resolveReport(rep.id, 'dismissed', false)}
									class="px-2.5 py-1 rounded bg-stone-200 dark:bg-stone-800"
								>
									Dismiss
								</button>
								<button
									type="button"
									onclick={() => resolveReport(rep.id, 'resolved', true)}
									class="px-2.5 py-1 rounded bg-red-600 text-white font-bold"
								>
									Delete Content
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
