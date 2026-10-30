import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { posts, postTags } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { extractHashtags } from '$lib/server/services/social.js';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const [existing] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
	if (!existing) return json({ error: 'Post not found' }, { status: 404 });

	if (existing.authorId !== locals.user.id && locals.user.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const body = await request.json().catch(() => ({}));
	const caption = String(body.caption ?? existing.caption).trim();
	const locationName = String(body.locationName ?? existing.locationName).trim();

	const [updated] = await db
		.update(posts)
		.set({
			caption,
			locationName,
			updatedAt: new Date()
		})
		.where(eq(posts.id, params.id))
		.returning();

	// Re-sync hashtags
	await db.delete(postTags).where(eq(postTags.postId, params.id));
	for (const tag of extractHashtags(caption)) {
		await db.insert(postTags).values({ postId: params.id, tag });
	}

	return json({ post: updated });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const [existing] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
	if (!existing) return json({ error: 'Post not found' }, { status: 404 });

	if (existing.authorId !== locals.user.id && locals.user.role !== 'admin') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	await db.delete(posts).where(eq(posts.id, params.id));
	return json({ deleted: true });
};
