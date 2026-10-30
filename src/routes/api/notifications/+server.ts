import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	notifications,
	notificationPreferences,
	pushSubscriptions,
	users
} from '$lib/server/db/schema.js';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { formatUserSummary } from '$lib/server/services/social.js';
import { getVapidKeys } from '$lib/server/push/index.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const rows = await db
		.select({
			notification: notifications,
			actor: users
		})
		.from(notifications)
		.innerJoin(users, eq(notifications.actorId, users.id))
		.where(eq(notifications.recipientId, locals.user.id))
		.orderBy(desc(notifications.createdAt))
		.limit(50);

	const [prefs] = await db
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, locals.user.id))
		.limit(1);

	const vapid = getVapidKeys();

	return json({
		notifications: rows.map(({ notification, actor }) => ({
			id: notification.id,
			type: notification.type,
			referenceId: notification.referenceId,
			messageText: notification.messageText,
			readAt: notification.readAt ? notification.readAt.toISOString() : null,
			createdAt: notification.createdAt.toISOString(),
			actor: formatUserSummary(actor)
		})),
		preferences: prefs || {
			likes: true,
			comments: true,
			mentions: true,
			stories: true,
			messages: true,
			webPushEnabled: true
		},
		vapidPublicKey: vapid.publicKey
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || 'mark_read');

	if (action === 'mark_read') {
		await db
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notifications.recipientId, locals.user.id),
					isNull(notifications.readAt)
				)
			);
		return json({ ok: true });
	}

	if (action === 'update_preferences') {
		const updated = {
			userId: locals.user.id,
			likes: Boolean(body.likes ?? true),
			comments: Boolean(body.comments ?? true),
			mentions: Boolean(body.mentions ?? true),
			stories: Boolean(body.stories ?? true),
			messages: Boolean(body.messages ?? true),
			webPushEnabled: Boolean(body.webPushEnabled ?? true),
			updatedAt: new Date()
		};

		await db
			.insert(notificationPreferences)
			.values(updated)
			.onConflictDoUpdate({
				target: notificationPreferences.userId,
				set: updated
			});

		return json({ preferences: updated });
	}

	if (action === 'subscribe_push') {
		const endpoint = String(body.endpoint || '');
		const p256dh = String(body.keys?.p256dh || '');
		const auth = String(body.keys?.auth || '');

		if (!endpoint || !p256dh || !auth) {
			return json({ error: 'Invalid PushSubscription object' }, { status: 400 });
		}

		await db
			.insert(pushSubscriptions)
			.values({
				userId: locals.user.id,
				endpoint,
				p256dh,
				auth,
				userAgent: request.headers.get('user-agent') || ''
			})
			.onConflictDoNothing();

		return json({ subscribed: true });
	}

	return json({ error: 'Invalid notification action' }, { status: 400 });
};
