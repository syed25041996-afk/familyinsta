import { db, ensureSchema } from '../db/index.js';
import {
	users,
	posts,
	postMedia,
	postTags,
	postMentions,
	reactions,
	comments,
	mediaItems,
	stories,
	storyViews,
	highlights,
	highlightItems,
	albums,
	albumContributors,
	albumMedia,
	conversations,
	conversationMembers,
	messages
} from '../db/schema.js';
import { eq, desc, asc, and, gt, inArray, ilike, or, sql } from 'drizzle-orm';
import { getVisibleUserIdsForViewer } from '../auth/index.js';
import { formatMediaForClient, signMediaUrl } from '../media/signer.js';
import { createNotification } from '../push/index.js';

export function formatUserSummary(u: {
	id: string;
	username: string;
	displayName: string;
	relationshipLabel: string;
	role: 'admin' | 'member' | 'child';
	avatarMediaId: string | null;
	bio?: string;
}) {
	return {
		id: u.id,
		username: u.username,
		displayName: u.displayName,
		relationshipLabel: u.relationshipLabel,
		role: u.role,
		bio: u.bio || '',
		avatarUrl: u.avatarMediaId ? signMediaUrl(u.avatarMediaId, 'thumb') : null
	};
}

// -----------------------------------------------------------------------------
// 1. Chronological Family Feed & Post Hydration
// -----------------------------------------------------------------------------
export async function getChronologicalFeed(
	viewer: { id: string; role: 'admin' | 'member' | 'child' },
	limit = 20,
	beforeDateIso?: string
) {
	await ensureSchema();
	const allowedUserIds = await getVisibleUserIdsForViewer(viewer);
	if (allowedUserIds && allowedUserIds.length === 0) return [];

	const allPosts = await db
		.select({
			post: posts,
			author: users
		})
		.from(posts)
		.innerJoin(users, eq(posts.authorId, users.id))
		.where(eq(posts.isArchived, false))
		.orderBy(desc(posts.createdAt))
		.limit(limit * 2);

	const filtered = allPosts.filter((row) => {
		if (allowedUserIds && !allowedUserIds.includes(row.author.id)) return false;
		if (beforeDateIso && row.post.createdAt >= new Date(beforeDateIso)) return false;
		return true;
	}).slice(0, limit);

	return hydratePosts(filtered, viewer.id);
}

export async function hydratePosts(
	rows: Array<{ post: typeof posts.$inferSelect; author: typeof users.$inferSelect }>,
	viewerId: string
) {
	if (rows.length === 0) return [];
	const postIds = rows.map((r) => r.post.id);

	// Media items
	const pmRows = await db
		.select({
			postMedia: postMedia,
			media: mediaItems
		})
		.from(postMedia)
		.innerJoin(mediaItems, eq(postMedia.mediaId, mediaItems.id))
		.where(inArray(postMedia.postId, postIds))
		.orderBy(asc(postMedia.sortOrder));

	// Tags
	const tagRows = await db
		.select()
		.from(postTags)
		.where(inArray(postTags.postId, postIds));

	// Reactions
	const reactionRows = await db
		.select({
			reaction: reactions,
			user: users
		})
		.from(reactions)
		.innerJoin(users, eq(reactions.userId, users.id))
		.where(inArray(reactions.postId, postIds));

	// Comments
	const commentRows = await db
		.select({
			comment: comments,
			author: users
		})
		.from(comments)
		.innerJoin(users, eq(comments.authorId, users.id))
		.where(inArray(comments.postId, postIds))
		.orderBy(asc(comments.createdAt));

	return rows.map(({ post, author }) => {
		const media = pmRows
			.filter((m) => m.postMedia.postId === post.id)
			.map((m) => formatMediaForClient(m.media));

		const tags = tagRows.filter((t) => t.postId === post.id).map((t) => t.tag);

		const postReactions = reactionRows.filter((r) => r.reaction.postId === post.id);
		const myReaction =
			postReactions.find((r) => r.reaction.userId === viewerId)?.reaction.emoji || null;

		const reactionCounts: Record<string, number> = {};
		for (const r of postReactions) {
			reactionCounts[r.reaction.emoji] = (reactionCounts[r.reaction.emoji] || 0) + 1;
		}

		const postComments = commentRows
			.filter((c) => c.comment.postId === post.id)
			.map((c) => ({
				id: c.comment.id,
				postId: c.comment.postId,
				parentCommentId: c.comment.parentCommentId,
				body: c.comment.body,
				createdAt: c.comment.createdAt.toISOString(),
				author: formatUserSummary(c.author)
			}));

		return {
			id: post.id,
			caption: post.caption,
			locationName: post.locationName,
			keepExif: post.keepExif,
			createdAt: post.createdAt.toISOString(),
			updatedAt: post.updatedAt.toISOString(),
			author: formatUserSummary(author),
			media,
			tags,
			reactionsTotal: postReactions.length,
			reactionCounts,
			myReaction,
			recentReactors: postReactions.slice(0, 4).map((r) => ({
				username: r.user.username,
				displayName: r.user.displayName,
				emoji: r.reaction.emoji
			})),
			comments: postComments
		};
	});
}

export function extractHashtags(text: string): string[] {
	const matches = text.match(/#([a-zA-Z0-9_\u0900-\u0D7F]+)/g) || [];
	return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
}

export function extractMentions(text: string): string[] {
	const matches = text.match(/@([a-zA-Z0-9_]+)/g) || [];
	return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
}

export async function createFamilyPost(params: {
	author: { id: string; displayName: string; role: 'admin' | 'member' | 'child' };
	mediaIds: string[];
	caption: string;
	locationName?: string;
	keepExif?: boolean;
}) {
	await ensureSchema();
	const keepExif = params.author.role === 'child' ? false : Boolean(params.keepExif);

	const [newPost] = await db
		.insert(posts)
		.values({
			authorId: params.author.id,
			caption: params.caption.trim(),
			locationName: (params.locationName || '').trim(),
			keepExif
		})
		.returning();

	for (let i = 0; i < params.mediaIds.length; i++) {
		await db.insert(postMedia).values({
			postId: newPost.id,
			mediaId: params.mediaIds[i],
			sortOrder: i
		});
	}

	// Extract and save #tags
	const tags = extractHashtags(params.caption);
	for (const tag of tags) {
		await db.insert(postTags).values({ postId: newPost.id, tag });
	}

	// Extract and notify @mentions
	const mentionUsernames = extractMentions(params.caption);
	if (mentionUsernames.length > 0) {
		const mentionedUsers = await db
			.select()
			.from(users)
			.where(inArray(users.username, mentionUsernames));

		for (const mu of mentionedUsers) {
			await db.insert(postMentions).values({
				postId: newPost.id,
				mentionedUserId: mu.id
			});
			await createNotification({
				recipientId: mu.id,
				actorId: params.author.id,
				type: 'mention',
				referenceId: newPost.id,
				messageText: `${params.author.displayName} mentioned you in a post`,
				url: `/?post=${newPost.id}`
			});
		}
	}

	return newPost;
}

// -----------------------------------------------------------------------------
// 2. 24-Hour Stories & Profile Highlights
// -----------------------------------------------------------------------------
export async function getActiveStoriesTray(viewer: {
	id: string;
	role: 'admin' | 'member' | 'child';
}) {
	await ensureSchema();
	const now = new Date();
	const allowedUserIds = await getVisibleUserIdsForViewer(viewer);

	const activeRows = await db
		.select({
			story: stories,
			author: users,
			media: mediaItems
		})
		.from(stories)
		.innerJoin(users, eq(stories.authorId, users.id))
		.innerJoin(mediaItems, eq(stories.mediaId, mediaItems.id))
		.where(gt(stories.expiresAt, now))
		.orderBy(asc(stories.createdAt));

	const visibleRows = activeRows.filter(
		(r) => !allowedUserIds || allowedUserIds.includes(r.author.id)
	);

	if (visibleRows.length === 0) return [];

	const storyIds = visibleRows.map((r) => r.story.id);
	const views = await db
		.select({
			view: storyViews,
			viewer: users
		})
		.from(storyViews)
		.innerJoin(users, eq(storyViews.viewerId, users.id))
		.where(inArray(storyViews.storyId, storyIds));

	// Group by author
	const groupedMap = new Map<
		string,
		{
			author: ReturnType<typeof formatUserSummary>;
			hasUnseen: boolean;
			stories: Array<{
				id: string;
				caption: string;
				createdAt: string;
				expiresAt: string;
				media: ReturnType<typeof formatMediaForClient>;
				seenByMe: boolean;
				viewers: Array<{
					id: string;
					username: string;
					displayName: string;
					relationshipLabel: string;
					viewedAt: string;
				}>;
			}>;
		}
	>();

	for (const row of visibleRows) {
		const storyViewList = views.filter((v) => v.view.storyId === row.story.id);
		const seenByMe =
			row.author.id === viewer.id ||
			storyViewList.some((v) => v.viewer.id === viewer.id);

		const formattedStory = {
			id: row.story.id,
			caption: row.story.caption,
			createdAt: row.story.createdAt.toISOString(),
			expiresAt: row.story.expiresAt.toISOString(),
			media: formatMediaForClient(row.media),
			seenByMe,
			viewers: storyViewList.map((v) => ({
				id: v.viewer.id,
				username: v.viewer.username,
				displayName: v.viewer.displayName,
				relationshipLabel: v.viewer.relationshipLabel,
				viewedAt: v.view.viewedAt.toISOString()
			}))
		};

		let group = groupedMap.get(row.author.id);
		if (!group) {
			group = {
				author: formatUserSummary(row.author),
				hasUnseen: false,
				stories: []
			};
			groupedMap.set(row.author.id, group);
		}
		if (!seenByMe) group.hasUnseen = true;
		group.stories.push(formattedStory);
	}

	return Array.from(groupedMap.values()).sort((a, b) =>
		a.hasUnseen === b.hasUnseen ? 0 : a.hasUnseen ? -1 : 1
	);
}

// -----------------------------------------------------------------------------
// 3. "On This Day" Memories
// -----------------------------------------------------------------------------
export async function getOnThisDayMemories(viewer: {
	id: string;
	role: 'admin' | 'member' | 'child';
}) {
	await ensureSchema();
	const allowedUserIds = await getVisibleUserIdsForViewer(viewer);
	const now = new Date();
	const currentMonth = now.getMonth() + 1;
	const currentDay = now.getDate();
	const currentYear = now.getFullYear();

	const allPosts = await db
		.select({
			post: posts,
			author: users
		})
		.from(posts)
		.innerJoin(users, eq(posts.authorId, users.id))
		.where(eq(posts.isArchived, false))
		.orderBy(asc(posts.createdAt));

	const matched = allPosts.filter(({ post, author }) => {
		if (allowedUserIds && !allowedUserIds.includes(author.id)) return false;
		const d = post.createdAt;
		return (
			d.getMonth() + 1 === currentMonth &&
			d.getDate() === currentDay &&
			d.getFullYear() < currentYear
		);
	});

	const hydrated = await hydratePosts(matched.slice(0, 6), viewer.id);
	return hydrated.map((p) => ({
		...p,
		yearsAgo: currentYear - new Date(p.createdAt).getFullYear()
	}));
}

// -----------------------------------------------------------------------------
// 4. Shared Family Albums
// -----------------------------------------------------------------------------
export async function getAlbumsForViewer(viewer: {
	id: string;
	role: 'admin' | 'member' | 'child';
}) {
	await ensureSchema();
	const allowedUserIds = await getVisibleUserIdsForViewer(viewer);

	const albumRows = await db
		.select({
			album: albums,
			owner: users
		})
		.from(albums)
		.innerJoin(users, eq(albums.ownerId, users.id))
		.orderBy(desc(albums.eventDate));

	const visibleAlbums = albumRows.filter(
		(r) => !allowedUserIds || allowedUserIds.includes(r.owner.id)
	);

	if (visibleAlbums.length === 0) return [];
	const albumIds = visibleAlbums.map((a) => a.album.id);

	const amRows = await db
		.select({
			albumMedia: albumMedia,
			media: mediaItems,
			addedBy: users
		})
		.from(albumMedia)
		.innerJoin(mediaItems, eq(albumMedia.mediaId, mediaItems.id))
		.innerJoin(users, eq(albumMedia.addedById, users.id))
		.where(inArray(albumMedia.albumId, albumIds))
		.orderBy(desc(albumMedia.createdAt));

	const contribRows = await db
		.select({
			contrib: albumContributors,
			user: users
		})
		.from(albumContributors)
		.innerJoin(users, eq(albumContributors.userId, users.id))
		.where(inArray(albumContributors.albumId, albumIds));

	return visibleAlbums.map(({ album, owner }) => {
		const items = amRows
			.filter((m) => m.albumMedia.albumId === album.id)
			.map((m) => ({
				id: m.albumMedia.id,
				caption: m.albumMedia.caption,
				addedBy: formatUserSummary(m.addedBy),
				media: formatMediaForClient(m.media)
			}));

		const contributors = contribRows
			.filter((c) => c.contrib.albumId === album.id)
			.map((c) => formatUserSummary(c.user));

		const coverUrl = album.coverMediaId
			? signMediaUrl(album.coverMediaId, 'thumb')
			: items[0]?.media.thumbUrl || null;

		return {
			id: album.id,
			title: album.title,
			description: album.description,
			isShared: album.isShared,
			eventDate: album.eventDate.toISOString(),
			createdAt: album.createdAt.toISOString(),
			owner: formatUserSummary(owner),
			coverUrl,
			itemCount: items.length,
			items,
			contributors
		};
	});
}

// -----------------------------------------------------------------------------
// 5. Search (People, Captions, #Tags, Albums)
// -----------------------------------------------------------------------------
export async function searchFamilyVault(
	viewer: { id: string; role: 'admin' | 'member' | 'child' },
	rawQuery: string
) {
	await ensureSchema();
	const q = rawQuery.trim();
	const allowedUserIds = await getVisibleUserIdsForViewer(viewer);

	if (!q) {
		const allPeople = await db.select().from(users).where(eq(users.isActive, true)).limit(20);
		return {
			people: allPeople
				.filter((u) => !allowedUserIds || allowedUserIds.includes(u.id))
				.map(formatUserSummary),
			posts: [],
			tags: [],
			albums: []
		};
	}

	const pattern = `%${q.replace(/^#/, '')}%`;

	// 1. People
	const peopleRows = await db
		.select()
		.from(users)
		.where(
			and(
				eq(users.isActive, true),
				or(
					ilike(users.displayName, pattern),
					ilike(users.username, pattern),
					ilike(users.relationshipLabel, pattern)
				)
			)
		)
		.limit(20);

	const people = peopleRows
		.filter((u) => !allowedUserIds || allowedUserIds.includes(u.id))
		.map(formatUserSummary);

	// 2. Tags
	const matchingTags = await db
		.select()
		.from(postTags)
		.where(ilike(postTags.tag, pattern))
		.limit(50);

	const tagPostIds = new Set(matchingTags.map((t) => t.postId));
	const uniqueTags = Array.from(new Set(matchingTags.map((t) => t.tag)));

	// 3. Posts (by caption, location, or matching #tag)
	const captionPosts = await db
		.select({
			post: posts,
			author: users
		})
		.from(posts)
		.innerJoin(users, eq(posts.authorId, users.id))
		.where(
			and(
				eq(posts.isArchived, false),
				or(ilike(posts.caption, pattern), ilike(posts.locationName, pattern))
			)
		)
		.orderBy(desc(posts.createdAt))
		.limit(20);

	let tagPosts: Array<{ post: typeof posts.$inferSelect; author: typeof users.$inferSelect }> = [];
	if (tagPostIds.size > 0) {
		tagPosts = await db
			.select({
				post: posts,
				author: users
			})
			.from(posts)
			.innerJoin(users, eq(posts.authorId, users.id))
			.where(inArray(posts.id, Array.from(tagPostIds)))
			.orderBy(desc(posts.createdAt));
	}

	const mergedPostsMap = new Map<
		string,
		{ post: typeof posts.$inferSelect; author: typeof users.$inferSelect }
	>();
	for (const r of [...captionPosts, ...tagPosts]) {
		if (!allowedUserIds || allowedUserIds.includes(r.author.id)) {
			mergedPostsMap.set(r.post.id, r);
		}
	}

	const hydratedPosts = await hydratePosts(Array.from(mergedPostsMap.values()), viewer.id);

	// 4. Albums
	const allAlbums = await getAlbumsForViewer(viewer);
	const matchedAlbums = allAlbums.filter(
		(a) =>
			a.title.toLowerCase().includes(q.toLowerCase()) ||
			a.description.toLowerCase().includes(q.toLowerCase())
	);

	return {
		people,
		posts: hydratedPosts,
		tags: uniqueTags,
		albums: matchedAlbums
	};
}
