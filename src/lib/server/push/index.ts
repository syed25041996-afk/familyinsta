import webpush from 'web-push';
import { db, ensureSchema } from '../db/index.js';
import {
	notifications,
	notificationPreferences,
	pushSubscriptions
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { broadcastToUser } from '../ws/hub.js';
import { log } from '../logger.js';

let vapidKeys: { publicKey: string; privateKey: string } | null = null;

export function getVapidKeys(): { publicKey: string; privateKey: string } {
	if (vapidKeys) return vapidKeys;

	if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
		vapidKeys = {
			publicKey: process.env.VAPID_PUBLIC_KEY,
			privateKey: process.env.VAPID_PRIVATE_KEY
		};
	} else {
		vapidKeys = webpush.generateVAPIDKeys();
	}

	try {
		webpush.setVapidDetails(
			process.env.VAPID_SUBJECT || 'mailto:admin@localhost',
			vapidKeys.publicKey,
			vapidKeys.privateKey
		);
	} catch {
		// Ignore invalid subject in test environments
	}

	return vapidKeys;
}

export async function createNotification(params: {
	recipientId: string;
	actorId: string;
	type:
		| 'like'
		| 'comment'
		| 'mention'
		| 'story'
		| 'message'
		| 'album'
		| 'child_contact_request';
	referenceId: string;
	messageText: string;
	url?: string;
}): Promise<void> {
	if (params.recipientId === params.actorId && params.type !== 'child_contact_request') {
		return;
	}

	await ensureSchema();

	// Check recipient preferences
	const prefRows = await db
		.select()
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, params.recipientId))
		.limit(1);

	const prefs = prefRows[0] || {
		likes: true,
		comments: true,
		mentions: true,
		stories: true,
		messages: true,
		webPushEnabled: true
	};

	if (params.type === 'like' && !prefs.likes) return;
	if (params.type === 'comment' && !prefs.comments) return;
	if (params.type === 'mention' && !prefs.mentions) return;
	if (params.type === 'story' && !prefs.stories) return;
	if (params.type === 'message' && !prefs.messages) return;

	const [notif] = await db
		.insert(notifications)
		.values({
			recipientId: params.recipientId,
			actorId: params.actorId,
			type: params.type,
			referenceId: params.referenceId,
			messageText: params.messageText
		})
		.returning();

	// Real-time WebSocket push
	broadcastToUser(params.recipientId, {
		type: 'notification:new',
		data: {
			id: notif.id,
			type: notif.type,
			referenceId: notif.referenceId,
			messageText: notif.messageText,
			createdAt: notif.createdAt.toISOString()
		}
	});

	// Web Push notification if enabled
	if (prefs.webPushEnabled) {
		const subs = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, params.recipientId));

		if (subs.length > 0) {
			getVapidKeys();
			const payload = JSON.stringify({
				title: 'Kinship Family',
				body: params.messageText,
				url: params.url || '/activity',
				tag: `${params.type}-${params.referenceId}`
			});

			for (const sub of subs) {
				try {
					await webpush.sendNotification(
						{
							endpoint: sub.endpoint,
							keys: { p256dh: sub.p256dh, auth: sub.auth }
						},
						payload
					);
				} catch (err: unknown) {
					const statusCode = (err as { statusCode?: number })?.statusCode;
					if (statusCode === 404 || statusCode === 410) {
						await db
							.delete(pushSubscriptions)
							.where(eq(pushSubscriptions.id, sub.id));
					} else {
						log('warn', 'web_push_send_failed', { userId: params.recipientId });
					}
				}
			}
		}
	}
}
