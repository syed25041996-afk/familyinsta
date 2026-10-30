import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	users,
	posts,
	highlights,
	highlightItems,
	stories,
	mediaItems
} from '$lib/server/db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { formatUserSummary, hydratePosts } from '$lib/server/services/social.js';
import { canUsersInteract } from '$lib/server/auth/index.js';
import { formatMediaForClient, signMediaUrl } from '$lib/server/media/signer.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	await ensureSchema();

	const [profileUser] = await db
		.select()
		.from(users)
		.where(eq(users.username, params.username.toLowerCase()))
		.limit(1);

	if (!profileUser) {
		throw error(404, 'Family member not found');
	}

	const canInteract = await canUsersInteract(locals.user, profileUser);

	if (!canInteract) {
		return {
			profile: formatUserSummary(profileUser),
			restrictedForChild: true,
			posts: [],
			highlights: []
		};
	}

	const userPostsRows = await db
		.select()
		.from(posts)
		.where(eq(posts.authorId, profileUser.id))
		.orderBy(desc(posts.createdAt));

	const hydratedPosts = await hydratePosts(
		userPostsRows.map((p) => ({ post: p, author: profileUser })),
		locals.user.id
	);

	// Load saved profile Highlights
	const userHighlights = await db
		.select()
		.from(highlights)
		.where(eq(highlights.userId, profileUser.id));

	let hydratedHighlights: Array<{
		id: string;
		title: string;
		coverUrl: string | null;
		items: Array<{
			id: string;
			caption: string;
			media: ReturnType<typeof formatMediaForClient>;
		}>;
	}> = [];

	if (userHighlights.length > 0) {
		const hlIds = userHighlights.map((h) => h.id);
		const hiRows = await db
			.select({
				item: highlightItems,
				story: stories,
				media: mediaItems
			})
			.from(highlightItems)
			.innerJoin(stories, eq(highlightItems.storyId, stories.id))
			.innerJoin(mediaItems, eq(stories.mediaId, mediaItems.id))
			.where(inArray(highlightItems.highlightId, hlIds));

		hydratedHighlights = userHighlights.map((h) => {
			const items = hiRows
				.filter((r) => r.item.highlightId === h.id)
				.map((r) => ({
					id: r.story.id,
					caption: r.story.caption,
					media: formatMediaForClient(r.media)
				}));

			return {
				id: h.id,
				title: h.title,
				coverUrl: h.coverMediaId
					? signMediaUrl(h.coverMediaId, 'thumb')
					: items[0]?.media.thumbUrl || null,
				items
			};
		});
	}

	return {
		profile: {
			...formatUserSummary(profileUser),
			email: profileUser.email,
			createdAt: profileUser.createdAt.toISOString()
		},
		restrictedForChild: false,
		posts: hydratedPosts,
		highlights: hydratedHighlights
	};
};
