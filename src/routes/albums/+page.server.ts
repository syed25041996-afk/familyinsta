import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAlbumsForViewer, formatUserSummary } from '$lib/server/services/social.js';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	await ensureSchema();

	const [albumsList, familyRows] = await Promise.all([
		getAlbumsForViewer(locals.user),
		db.select().from(users).where(eq(users.isActive, true))
	]);

	return {
		albums: albumsList,
		familyMembers: familyRows.map(formatUserSummary)
	};
};
