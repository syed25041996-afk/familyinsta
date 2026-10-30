import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	posts,
	reactions,
	comments,
	users,
	reports,
	postMentions
} from '$lib/server/db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import {
	getChronologicalFeed,
	createFamilyPost,
	extractMentions,
	formatUserSummary
} from '$lib/server/services/social.js';
import { createNotification } from '$lib/server/push/index.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const cursor = url.searchParams.get('cursor') || undefined;
	const limit = Math.min(30, Number(url.searchParams.get('limit') || 15));
	const feed = await getChronologicalFeed(locals.user, limit, cursor);
	return json({ posts: feed });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || 'create');

	// 1. Create a new Post
	if (action === 'create') {
		const mediaIds = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : [];
		const caption = String(body.caption || '');
		const locationName = String(body.locationName || '');
		const keepExif = Boolean(body.keepExif);

		if (mediaIds.length === 0) {
			return json({ error: 'Please attach at least one photo or video.' }, { status: 400 });
		}

		const created = await createFamilyPost({
			author: locals.user,
			mediaIds,
			caption,
			locationName,
			keepExif
		});

		return json({ post: created });
	}

	// 2. Toggle Reaction (Like / Emoji)
	if (action === 'react') {
		const postId = String(body.postId || '');
		const emoji = String(body.emoji || '❤️');
		if (!postId) return json({ error: 'Post ID required' }, { status: 400 });

		const existing = await db
			.select()
			.from(reactions)
			.where(and(eq(reactions.postId, postId), eq(reactions.userId, locals.user.id)))
			.limit(1);

		if (existing.length > 0 && existing[0].emoji === emoji) {
			await db.delete(reactions).where(eq(reactions.id, existing[0].id));
			return json({ reacted: false, emoji: null });
		} else if (existing.length > 0) {
			await db
				.update(reactions)
				.set({ emoji })
				.where(eq(reactions.id, existing[0].id));
		} else {
			await db.insert(reactions).values({
				postId,
				userId: locals.user.id,
				emoji
			});

			const [postRow] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
			if (postRow) {
				await createNotification({
					recipientId: postRow.authorId,
					actorId: locals.user.id,
					type: 'like',
					referenceId: postId,
					messageText: `${locals.user.displayName} reacted ${emoji} to your post`,
					url: `/?post=${postId}`
				});
			}
		}

		return json({ reacted: true, emoji });
	}

	// 3. Add Threaded Comment
	if (action === 'comment') {
		const postId = String(body.postId || '');
		const commentBody = String(body.body || '').trim();
		const parentCommentId = body.parentCommentId ? String(body.parentCommentId) : null;

		if (!postId || !commentBody) {
			return json({ error: 'Comment text is required.' }, { status: 400 });
		}

		const [newComment] = await db
			.insert(comments)
			.values({
				postId,
				authorId: locals.user.id,
				parentCommentId,
				body: commentBody
			})
			.returning();

		const [postRow] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
		if (postRow) {
			await createNotification({
				recipientId: postRow.authorId,
				actorId: locals.user.id,
				type: 'comment',
				referenceId: postId,
				messageText: `${locals.user.displayName} commented: "${commentBody.slice(0, 60)}"`,
				url: `/?post=${postId}`
			});
		}

		// Notify @mentioned users in comment
		const mentionUsernames = extractMentions(commentBody);
		if (mentionUsernames.length > 0) {
			const mentionedUsers = await db
				.select()
				.from(users)
				.where(inArray(users.username, mentionUsernames));

			for (const mu of mentionedUsers) {
				await db.insert(postMentions).values({
					postId,
					commentId: newComment.id,
					mentionedUserId: mu.id
				});
				await createNotification({
					recipientId: mu.id,
					actorId: locals.user.id,
					type: 'mention',
					referenceId: postId,
					messageText: `${locals.user.displayName} mentioned you in a comment`,
					url: `/?post=${postId}`
				});
			}
		}

		return json({
			comment: {
				id: newComment.id,
				postId: newComment.postId,
				parentCommentId: newComment.parentCommentId,
				body: newComment.body,
				createdAt: newComment.createdAt.toISOString(),
				author: formatUserSummary(locals.user)
			}
		});
	}

	// 4. Report content to Family Admins
	if (action === 'report') {
		const targetType = (body.targetType || 'post') as 'post' | 'comment' | 'message';
		const targetId = String(body.targetId || '');
		const reason = String(body.reason || 'Flagged for admin review').trim();
		if (!targetId) return json({ error: 'Target ID required' }, { status: 400 });

		const [report] = await db
			.insert(reports)
			.values({
				reporterId: locals.user.id,
				targetType,
				targetId,
				reason
			})
			.returning();

		return json({ report });
	}

	return json({ error: 'Unknown post action' }, { status: 400 });
};
