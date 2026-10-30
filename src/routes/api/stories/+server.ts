import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	stories,
	storyViews,
	highlights,
	highlightItems,
	users
} from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { getActiveStoriesTray } from '$lib/server/services/social.js';
import { createNotification } from '$lib/server/push/index.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const tray = await getActiveStoriesTray(locals.user);
	return json({ storiesTray: tray });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || 'create');

	// 1. Publish a 24-hour Story
	if (action === 'create') {
		const mediaId = String(body.mediaId || '');
		const caption = String(body.caption || '').trim();
		if (!mediaId) return json({ error: 'Media ID is required' }, { status: 400 });

		const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const [story] = await db
			.insert(stories)
			.values({
				authorId: locals.user.id,
				mediaId,
				caption,
				expiresAt
			})
			.returning();

		// Notify active family members about new story
		const family = await db.select().from(users).where(eq(users.isActive, true));
		for (const member of family) {
			if (member.id !== locals.user.id) {
				await createNotification({
					recipientId: member.id,
					actorId: locals.user.id,
					type: 'story',
					referenceId: story.id,
					messageText: `${locals.user.displayName} added a new 24h story`,
					url: '/'
				});
			}
		}

		return json({ story });
	}

	// 2. Record a Story View
	if (action === 'view') {
		const storyId = String(body.storyId || '');
		if (!storyId) return json({ error: 'Story ID required' }, { status: 400 });

		await db
			.insert(storyViews)
			.values({
				storyId,
				viewerId: locals.user.id
			})
			.onConflictDoNothing();

		return json({ viewed: true });
	}

	// 3. Save Story to Profile Highlights
	if (action === 'save_highlight') {
		const storyId = String(body.storyId || '');
		const highlightTitle = String(body.title || 'Memories').trim();
		if (!storyId) return json({ error: 'Story ID required' }, { status: 400 });

		const [storyRow] = await db
			.select()
			.from(stories)
			.where(eq(stories.id, storyId))
			.limit(1);

		if (!storyRow) return json({ error: 'Story not found' }, { status: 404 });

		// Find or create highlight with this title for the user
		const existingHighlights = await db
			.select()
			.from(highlights)
			.where(eq(highlights.userId, locals.user.id));

		let highlight = existingHighlights.find(
			(h) => h.title.toLowerCase() === highlightTitle.toLowerCase()
		);

		if (!highlight) {
			const [created] = await db
				.insert(highlights)
				.values({
					userId: locals.user.id,
					title: highlightTitle,
					coverMediaId: storyRow.mediaId
				})
				.returning();
			highlight = created;
		}

		await db
			.insert(highlightItems)
			.values({
				highlightId: highlight.id,
				storyId: storyRow.id
			})
			.onConflictDoNothing();

		return json({ highlight });
	}

	return json({ error: 'Invalid story action' }, { status: 400 });
};
