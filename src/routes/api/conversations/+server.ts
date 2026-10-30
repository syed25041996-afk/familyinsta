import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	conversations,
	conversationMembers,
	messages,
	users,
	mediaItems
} from '$lib/server/db/schema.js';
import { eq, inArray, asc, desc, and } from 'drizzle-orm';
import { formatUserSummary } from '$lib/server/services/social.js';
import { formatMediaForClient } from '$lib/server/media/signer.js';
import { canUsersInteract } from '$lib/server/auth/index.js';
import { broadcastToUsers } from '$lib/server/ws/hub.js';
import { createNotification } from '$lib/server/push/index.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const conversationId = url.searchParams.get('conversationId');

	// Fetch user's conversation memberships
	const myMemberships = await db
		.select()
		.from(conversationMembers)
		.where(eq(conversationMembers.userId, locals.user.id));

	if (myMemberships.length === 0) {
		return json({ conversations: [], messages: [] });
	}

	const convIds = myMemberships.map((m) => m.conversationId);
	const convRows = await db
		.select()
		.from(conversations)
		.where(inArray(conversations.id, convIds))
		.orderBy(desc(conversations.lastMessageAt));

	const allMembers = await db
		.select({
			member: conversationMembers,
			user: users
		})
		.from(conversationMembers)
		.innerJoin(users, eq(conversationMembers.userId, users.id))
		.where(inArray(conversationMembers.conversationId, convIds));

	const hydratedConversations = convRows.map((c) => {
		const members = allMembers
			.filter((m) => m.member.conversationId === c.id)
			.map((m) => ({
				...formatUserSummary(m.user),
				lastReadMessageId: m.member.lastReadMessageId,
				lastReadAt: m.member.lastReadAt.toISOString()
			}));

		const otherMembers = members.filter((m) => m.id !== locals.user!.id);
		const displayTitle =
			c.type === 'group' && c.title
				? c.title
				: otherMembers.map((m) => m.displayName).join(', ') || 'Family Chat';

		return {
			id: c.id,
			type: c.type,
			title: displayTitle,
			lastMessageAt: c.lastMessageAt.toISOString(),
			members
		};
	});

	const activeConvId = conversationId || hydratedConversations[0]?.id;
	if (!activeConvId || !convIds.includes(activeConvId)) {
		return json({ conversations: hydratedConversations, messages: [] });
	}

	const msgRows = await db
		.select({
			message: messages,
			sender: users
		})
		.from(messages)
		.innerJoin(users, eq(messages.senderId, users.id))
		.where(eq(messages.conversationId, activeConvId))
		.orderBy(asc(messages.createdAt));

	const mediaIds = msgRows.map((r) => r.message.mediaId).filter((id): id is string => Boolean(id));
	const mediaMap = new Map<string, ReturnType<typeof formatMediaForClient>>();
	if (mediaIds.length > 0) {
		const mRows = await db
			.select()
			.from(mediaItems)
			.where(inArray(mediaItems.id, mediaIds));
		for (const m of mRows) {
			mediaMap.set(m.id, formatMediaForClient(m));
		}
	}

	const convMembers = allMembers.filter((m) => m.member.conversationId === activeConvId);

	const hydratedMessages = msgRows.map(({ message, sender }) => {
		const seenBy = convMembers
			.filter(
				(m) =>
					m.user.id !== sender.id &&
					(m.member.lastReadMessageId === message.id ||
						m.member.lastReadAt >= message.createdAt)
			)
			.map((m) => m.user.displayName);

		return {
			id: message.id,
			conversationId: message.conversationId,
			body: message.body,
			createdAt: message.createdAt.toISOString(),
			sender: formatUserSummary(sender),
			media: message.mediaId ? mediaMap.get(message.mediaId) || null : null,
			seenBy
		};
	});

	return json({
		conversations: hydratedConversations,
		activeConversationId: activeConvId,
		messages: hydratedMessages
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || 'send');

	// 1. Start a 1:1 or Group Conversation
	if (action === 'start') {
		const recipientIds: string[] = Array.isArray(body.recipientIds)
			? body.recipientIds.map(String)
			: [];
		const title = String(body.title || '').trim();

		if (recipientIds.length === 0) {
			return json({ error: 'Select at least one family member.' }, { status: 400 });
		}

		// Enforce Child account safety circle check
		const targetUsers = await db
			.select()
			.from(users)
			.where(inArray(users.id, recipientIds));

		for (const target of targetUsers) {
			const allowed = await canUsersInteract(locals.user, target);
			if (!allowed) {
				return json(
					{
						error: `Child safety protection: ${target.displayName} is not in the approved contact circle.`
					},
					{ status: 403 }
				);
			}
		}

		const type = recipientIds.length > 1 || title ? 'group' : 'direct';

		// If 1:1 direct chat, check if one already exists between the two users
		if (type === 'direct') {
			const otherId = recipientIds[0];
			const myConvs = await db
				.select()
				.from(conversationMembers)
				.where(eq(conversationMembers.userId, locals.user.id));

			for (const mc of myConvs) {
				const [conv] = await db
					.select()
					.from(conversations)
					.where(and(eq(conversations.id, mc.conversationId), eq(conversations.type, 'direct')))
					.limit(1);
				if (!conv) continue;

				const members = await db
					.select()
					.from(conversationMembers)
					.where(eq(conversationMembers.conversationId, conv.id));
				if (members.length === 2 && members.some((m) => m.userId === otherId)) {
					return json({ conversationId: conv.id });
				}
			}
		}

		const [conv] = await db
			.insert(conversations)
			.values({
				type,
				title,
				createdById: locals.user.id
			})
			.returning();

		const allParticipantIds = Array.from(new Set([locals.user.id, ...recipientIds]));
		for (const uid of allParticipantIds) {
			await db
				.insert(conversationMembers)
				.values({
					conversationId: conv.id,
					userId: uid
				})
				.onConflictDoNothing();
		}

		return json({ conversationId: conv.id });
	}

	// 2. Send Message (Text and/or Photo/Video)
	if (action === 'send') {
		const conversationId = String(body.conversationId || '');
		const text = String(body.body || '').trim();
		const mediaId = body.mediaId ? String(body.mediaId) : null;

		if (!conversationId || (!text && !mediaId)) {
			return json({ error: 'Message text or media is required.' }, { status: 400 });
		}

		// Verify membership
		const members = await db
			.select()
			.from(conversationMembers)
			.where(eq(conversationMembers.conversationId, conversationId));

		if (!members.some((m) => m.userId === locals.user!.id)) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const [newMsg] = await db
			.insert(messages)
			.values({
				conversationId,
				senderId: locals.user.id,
				body: text,
				mediaId
			})
			.returning();

		await db
			.update(conversations)
			.set({ lastMessageAt: new Date() })
			.where(eq(conversations.id, conversationId));

		await db
			.update(conversationMembers)
			.set({
				lastReadMessageId: newMsg.id,
				lastReadAt: new Date()
			})
			.where(
				and(
					eq(conversationMembers.conversationId, conversationId),
					eq(conversationMembers.userId, locals.user.id)
				)
			);

		let mediaFormatted = null;
		if (mediaId) {
			const [mRow] = await db
				.select()
				.from(mediaItems)
				.where(eq(mediaItems.id, mediaId))
				.limit(1);
			if (mRow) mediaFormatted = formatMediaForClient(mRow);
		}

		const formattedMsg = {
			id: newMsg.id,
			conversationId: newMsg.conversationId,
			body: newMsg.body,
			createdAt: newMsg.createdAt.toISOString(),
			sender: formatUserSummary(locals.user),
			media: mediaFormatted,
			seenBy: []
		};

		const memberUserIds = members.map((m) => m.userId);
		broadcastToUsers(memberUserIds, {
			type: 'chat:message',
			data: formattedMsg as unknown as Record<string, unknown>
		});

		for (const uid of memberUserIds) {
			if (uid !== locals.user.id) {
				await createNotification({
					recipientId: uid,
					actorId: locals.user.id,
					type: 'message',
					referenceId: conversationId,
					messageText: `${locals.user.displayName}: ${text || 'Sent a photo/video'}`,
					url: `/messages?c=${conversationId}`
				});
			}
		}

		return json({ message: formattedMsg });
	}

	// 3. Mark Conversation as Read (Read Receipts)
	if (action === 'read') {
		const conversationId = String(body.conversationId || '');
		const lastMessageId = body.lastMessageId ? String(body.lastMessageId) : null;
		if (!conversationId) return json({ error: 'Conversation ID required' }, { status: 400 });

		await db
			.update(conversationMembers)
			.set({
				lastReadMessageId: lastMessageId,
				lastReadAt: new Date()
			})
			.where(
				and(
					eq(conversationMembers.conversationId, conversationId),
					eq(conversationMembers.userId, locals.user.id)
				)
			);

		const members = await db
			.select()
			.from(conversationMembers)
			.where(eq(conversationMembers.conversationId, conversationId));

		broadcastToUsers(
			members.map((m) => m.userId),
			{
				type: 'chat:read',
				data: {
					conversationId,
					userId: locals.user.id,
					displayName: locals.user.displayName,
					lastMessageId
				}
			}
		);

		return json({ read: true });
	}

	return json({ error: 'Invalid conversation action' }, { status: 400 });
};
