import type { LayoutServerLoad } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { notifications } from '$lib/server/db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { signMediaUrl } from '$lib/server/media/signer.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	await ensureSchema();

	if (!locals.user) {
		return {
			user: null,
			csrfToken: null,
			unreadNotificationsCount: 0
		};
	}

	const unreadNotifs = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.recipientId, locals.user.id),
				isNull(notifications.readAt)
			)
		);

	return {
		user: {
			...locals.user,
			avatarUrl: locals.user.avatarMediaId
				? signMediaUrl(locals.user.avatarMediaId, 'thumb')
				: null
		},
		csrfToken: locals.session?.csrfToken || null,
		unreadNotificationsCount: unreadNotifs.length
	};
};
