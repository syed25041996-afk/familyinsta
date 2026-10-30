import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { albums, albumContributors, albumMedia } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { getAlbumsForViewer } from '$lib/server/services/social.js';
import { createNotification } from '$lib/server/push/index.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const list = await getAlbumsForViewer(locals.user);
	return json({ albums: list });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || 'create');

	// 1. Create a Shared Album
	if (action === 'create') {
		const title = String(body.title || '').trim();
		const description = String(body.description || '').trim();
		const eventDate = body.eventDate ? new Date(String(body.eventDate)) : new Date();
		const contributorIds: string[] = Array.isArray(body.contributorIds)
			? body.contributorIds.map(String)
			: [];
		const mediaIds: string[] = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : [];

		if (!title) {
			return json({ error: 'Album title is required.' }, { status: 400 });
		}

		const [album] = await db
			.insert(albums)
			.values({
				ownerId: locals.user.id,
				title,
				description,
				coverMediaId: mediaIds[0] || null,
				eventDate: Number.isNaN(eventDate.getTime()) ? new Date() : eventDate
			})
			.returning();

		for (const uid of contributorIds) {
			await db
				.insert(albumContributors)
				.values({ albumId: album.id, userId: uid })
				.onConflictDoNothing();

			await createNotification({
				recipientId: uid,
				actorId: locals.user.id,
				type: 'album',
				referenceId: album.id,
				messageText: `${locals.user.displayName} invited you to contribute to album "${title}"`,
				url: '/albums'
			});
		}

		for (const mid of mediaIds) {
			await db
				.insert(albumMedia)
				.values({
					albumId: album.id,
					mediaId: mid,
					addedById: locals.user.id
				})
				.onConflictDoNothing();
		}

		return json({ album });
	}

	// 2. Add Photos/Videos to Existing Album
	if (action === 'add_media') {
		const albumId = String(body.albumId || '');
		const mediaIds: string[] = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : [];
		const caption = String(body.caption || '').trim();

		if (!albumId || mediaIds.length === 0) {
			return json({ error: 'Album ID and at least one media item required.' }, { status: 400 });
		}

		for (const mid of mediaIds) {
			await db
				.insert(albumMedia)
				.values({
					albumId,
					mediaId: mid,
					addedById: locals.user.id,
					caption
				})
				.onConflictDoNothing();
		}

		// Update cover if empty
		const [alb] = await db.select().from(albums).where(eq(albums.id, albumId)).limit(1);
		if (alb && !alb.coverMediaId && mediaIds[0]) {
			await db
				.update(albums)
				.set({ coverMediaId: mediaIds[0] })
				.where(eq(albums.id, albumId));
		}

		return json({ added: mediaIds.length });
	}

	return json({ error: 'Invalid album action' }, { status: 400 });
};
