import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (!locals.user) throw redirect(302, '/login');
	const res = await fetch('/api/notifications');
	const data = await res.json();
	return {
		notifications: data.notifications || [],
		preferences: data.preferences,
		vapidPublicKey: data.vapidPublicKey
	};
};
