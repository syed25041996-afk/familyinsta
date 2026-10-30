import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { albums, albumMedia, mediaItems } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveMediaRelPath } from '$lib/server/media/processor.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	await ensureSchema();

	const [album] = await db
		.select()
		.from(albums)
		.where(eq(albums.id, params.id))
		.limit(1);

	if (!album) throw error(404, 'Album not found');

	const items = await db
		.select({
			media: mediaItems
		})
		.from(albumMedia)
		.innerJoin(mediaItems, eq(albumMedia.mediaId, mediaItems.id))
		.where(eq(albumMedia.albumId, album.id));

	const safeTitle = album.title
		.replace(/[^a-zA-Z0-9_-]/g, '_')
		.replace(/_+/g, '_')
		.slice(0, 50) || 'family_album';

	const passThrough = new PassThrough();
	const archive = archiver('zip', {
		store: true // Store originals uncompressed for fast streaming & minimal CPU/RAM usage
	});

	archive.pipe(passThrough);

	items.forEach(({ media }, index) => {
		const absPath = resolveMediaRelPath(media.originalRelPath);
		if (fs.existsSync(absPath)) {
			const ext = path.extname(media.originalRelPath) || '.jpg';
			const entryName = `${String(index + 1).padStart(3, '0')}_${media.id.slice(0, 8)}${ext}`;
			archive.file(absPath, { name: entryName });
		}
	});

	archive.finalize();

	return new Response(passThrough as unknown as ReadableStream, {
		status: 200,
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${safeTitle}_originals.zip"`,
			'Cache-Control': 'no-store'
		}
	});
};
