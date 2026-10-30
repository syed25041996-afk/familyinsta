import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { searchFamilyVault } from '$lib/server/services/social.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/login');
	const q = url.searchParams.get('q') || '';
	const results = await searchFamilyVault(locals.user, q);
	return {
		query: q,
		results
	};
};
