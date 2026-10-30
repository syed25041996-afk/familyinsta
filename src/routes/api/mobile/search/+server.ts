import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchFamilyVault } from '$lib/server/services/social.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const q = url.searchParams.get('q') || '';
	const results = await searchFamilyVault(locals.user, q);
	return json({ query: q, results });
};
