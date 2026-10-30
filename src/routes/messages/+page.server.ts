import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { formatUserSummary } from '$lib/server/services/social.js';
import { getVisibleUserIdsForViewer } from '$lib/server/auth/index.js';

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	await ensureSchema();

	const convId = url.searchParams.get('c') || '';
	const apiRes = await fetch(
		`/api/conversations${convId ? `?conversationId=${encodeURIComponent(convId)}` : ''}`
	);
	const convData = await apiRes.json();

	const allowedIds = await getVisibleUserIdsForViewer(locals.user);
	const allUsers = await db.select().from(users).where(eq(users.isActive, true));
	const availableContacts = allUsers
		.filter((u) => u.id !== locals.user!.id && (!allowedIds || allowedIds.includes(u.id)))
		.map(formatUserSummary);

	return {
		conversations: convData.conversations || [],
		activeConversationId: convData.activeConversationId || null,
		messages: convData.messages || [],
		availableContacts
	};
};
