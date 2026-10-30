import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { users, invites, notifications } from '$lib/server/db/schema.js';
import { eq, isNull, and } from 'drizzle-orm';
import {
	getChronologicalFeed,
	getActiveStoriesTray,
	getOnThisDayMemories,
	formatUserSummary
} from '$lib/server/services/social.js';

export const GET: RequestHandler = async ({ locals }) => {
	await ensureSchema();

	if (!locals.user) {
		const demoAccounts = await db
			.select({
				username: users.username,
				displayName: users.displayName,
				relationshipLabel: users.relationshipLabel,
				role: users.role
			})
			.from(users)
			.where(eq(users.isActive, true))
			.limit(8);

		const openInvites = await db
			.select({
				code: invites.code,
				assignedRole: invites.assignedRole,
				defaultRelationshipLabel: invites.defaultRelationshipLabel
			})
			.from(invites)
			.where(isNull(invites.claimedById))
			.limit(5);

		return json({
			authenticated: false,
			demoAccounts,
			openInvites
		});
	}

	const [feed, storiesTray, memories, unreadNotifs] = await Promise.all([
		getChronologicalFeed(locals.user, 20),
		getActiveStoriesTray(locals.user),
		getOnThisDayMemories(locals.user),
		db
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.recipientId, locals.user.id),
					isNull(notifications.readAt)
				)
			)
	]);

	return json({
		authenticated: true,
		user: {
			...formatUserSummary(locals.user),
			email: locals.user.email,
			locale: locals.user.locale,
			textScale: locals.user.textScale,
			theme: locals.user.theme
		},
		unreadNotificationsCount: unreadNotifs.length,
		feed,
		storiesTray,
		memories
	});
};
