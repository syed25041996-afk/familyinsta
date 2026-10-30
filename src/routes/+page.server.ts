import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getChronologicalFeed,
	getActiveStoriesTray,
	getOnThisDayMemories
} from '$lib/server/services/social.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const [feed, storiesTray, memories] = await Promise.all([
		getChronologicalFeed(locals.user, 20),
		getActiveStoriesTray(locals.user),
		getOnThisDayMemories(locals.user)
	]);

	return {
		feed,
		storiesTray,
		memories
	};
};
