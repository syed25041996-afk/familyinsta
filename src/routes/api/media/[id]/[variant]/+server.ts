import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { mediaItems } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyMediaSignature } from '$lib/server/media/signer.js';
import { resolveMediaRelPath } from '$lib/server/media/processor.js';

export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	const { id, variant } = params;
	const exp = url.searchParams.get('exp');
	const sig = url.searchParams.get('sig');

	// Verify HMAC signature OR authenticated session
	const signatureValid = verifyMediaSignature(id, variant, exp, sig);
	if (!signatureValid && !locals.user) {
		throw error(403, 'Invalid or expired signed media URL');
	}

	await ensureSchema();
	const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1);
	if (rows.length === 0) {
		throw error(404, 'Media not found');
	}
	const item = rows[0];

	let relPath = item.originalRelPath;
	let contentType = item.mimeType || 'application/octet-stream';

	if (variant === 'thumb' && item.thumbRelPath) {
		relPath = item.thumbRelPath;
		contentType = 'image/webp';
	} else if (variant === 'webp' && item.displayWebpRelPath) {
		relPath = item.displayWebpRelPath;
		contentType = 'image/webp';
	} else if (variant === 'avif' && item.displayAvifRelPath) {
		relPath = item.displayAvifRelPath;
		contentType = 'image/avif';
	} else if (variant === 'mp4' && item.videoMp4RelPath) {
		relPath = item.videoMp4RelPath;
		contentType = 'video/mp4';
	} else if (variant === 'hls' && item.videoHlsRelPath) {
		relPath = item.videoHlsRelPath;
		contentType = 'application/vnd.apple.mpegurl';
	}

	let absPath = resolveMediaRelPath(relPath);
	let stat: fs.Stats;
	try {
		stat = await fsPromises.stat(absPath);
	} catch {
		// Fallback to original if variant is still generating
		absPath = resolveMediaRelPath(item.originalRelPath);
		try {
			stat = await fsPromises.stat(absPath);
			contentType = item.mimeType;
		} catch {
			throw error(404, 'Media file missing on disk');
		}
	}

	const range = request.headers.get('range');
	if (range && contentType.startsWith('video/')) {
		const parts = range.replace(/bytes=/, '').split('-');
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
		const chunkSize = end - start + 1;
		const stream = fs.createReadStream(absPath, { start, end });

		return new Response(stream as unknown as ReadableStream, {
			status: 206,
			headers: {
				'Content-Range': `bytes ${start}-${end}/${stat.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(chunkSize),
				'Content-Type': contentType,
				'Cache-Control': 'private, max-age=3600'
			}
		});
	}

	const buffer = await fsPromises.readFile(absPath);
	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Content-Length': String(buffer.length),
			'Cache-Control': 'private, max-age=86400',
			'Accept-Ranges': 'bytes'
		}
	});
};
