import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { mediaItems, uploadSessions } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
	ensureMediaDirs,
	resolveMediaRelPath,
	processMediaItem
} from '$lib/server/media/processor.js';
import { formatMediaForClient } from '$lib/server/media/signer.js';
import { enqueueJob } from '$lib/server/queue/index.js';

const ALLOWED_IMAGE_MIMES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif',
	'image/heic',
	'image/heif'
]);

const ALLOWED_VIDEO_MIMES = new Set([
	'video/mp4',
	'video/quicktime',
	'video/webm',
	'video/x-matroska'
]);

/**
 * POST /api/media/upload
 * Supports:
 * 1) JSON { action: 'init', filename, mimeType, totalSizeBytes, totalChunks, keepExif, altText }
 * 2) JSON { action: 'complete', uploadId }
 * 3) Multipart FormData (direct file or single-chunk upload)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();
	await ensureMediaDirs();

	const contentType = request.headers.get('content-type') || '';

	// Mode A: JSON Chunked Upload Initialization or Finalization
	if (contentType.includes('application/json')) {
		const body = await request.json().catch(() => ({}));
		const action = String(body.action || 'init');

		if (action === 'init') {
			const filename = String(body.filename || 'upload.bin');
			const mimeType = String(body.mimeType || 'image/jpeg').toLowerCase();
			const totalSizeBytes = Number(body.totalSizeBytes || 0);
			const totalChunks = Math.max(1, Number(body.totalChunks || 1));
			const keepExif = locals.user.role === 'child' ? false : Boolean(body.keepExif);
			const altText = String(body.altText || '').trim();

			const isImage = ALLOWED_IMAGE_MIMES.has(mimeType);
			const isVideo = ALLOWED_VIDEO_MIMES.has(mimeType);
			if (!isImage && !isVideo) {
				return json({ error: `Unsupported media type: ${mimeType}` }, { status: 400 });
			}

			const maxBytes = isImage
				? Number(process.env.MAX_IMAGE_SIZE_MB || 50) * 1024 * 1024
				: Number(process.env.MAX_VIDEO_SIZE_MB || 2048) * 1024 * 1024;

			if (totalSizeBytes > maxBytes) {
				return json({ error: 'File exceeds maximum allowed size.' }, { status: 413 });
			}

			const ext = path.extname(filename).toLowerCase() || (isImage ? '.jpg' : '.mp4');
			const mediaId = crypto.randomUUID();
			const originalRelPath = `originals/${mediaId}${ext}`;

			const [media] = await db
				.insert(mediaItems)
				.values({
					id: mediaId,
					uploaderId: locals.user.id,
					type: isImage ? 'image' : 'video',
					status: 'uploading',
					originalRelPath,
					sizeBytes: totalSizeBytes,
					mimeType,
					altText,
					keepExif
				})
				.returning();

			const tempDirRelPath = `chunks/${mediaId}`;
			await fs.mkdir(resolveMediaRelPath(tempDirRelPath), { recursive: true });

			const [session] = await db
				.insert(uploadSessions)
				.values({
					mediaId: media.id,
					uploaderId: locals.user.id,
					filename,
					mimeType,
					totalSizeBytes,
					totalChunks,
					tempDirRelPath,
					keepExif,
					altText
				})
				.returning();

			return json({
				uploadId: session.id,
				mediaId: media.id,
				totalChunks
			});
		}

		if (action === 'complete') {
			const uploadId = String(body.uploadId || '');
			const sessions = await db
				.select()
				.from(uploadSessions)
				.where(
					and(
						eq(uploadSessions.id, uploadId),
						eq(uploadSessions.uploaderId, locals.user.id)
					)
				)
				.limit(1);

			if (sessions.length === 0) {
				return json({ error: 'Upload session not found.' }, { status: 404 });
			}
			const session = sessions[0];
			const [media] = await db
				.select()
				.from(mediaItems)
				.where(eq(mediaItems.id, session.mediaId))
				.limit(1);

			const origAbsPath = resolveMediaRelPath(media.originalRelPath);
			const tempDirAbs = resolveMediaRelPath(session.tempDirRelPath);

			// Assemble chunks in order
			const writeStream = fsSync.createWriteStream(origAbsPath);
			const hash = crypto.createHash('sha256');

			for (let i = 0; i < session.totalChunks; i++) {
				const chunkPath = path.join(tempDirAbs, `chunk_${i}`);
				const chunkBuf = await fs.readFile(chunkPath);
				hash.update(chunkBuf);
				writeStream.write(chunkBuf);
			}
			await new Promise<void>((resolve, reject) => {
				writeStream.end(() => resolve());
				writeStream.on('error', reject);
			});

			// Clean up chunks directory
			await fs.rm(tempDirAbs, { recursive: true, force: true }).catch(() => {});

			// Verify magic bytes on assembled file
			const headBuf = Buffer.alloc(4100);
			const fd = await fs.open(origAbsPath, 'r');
			await fd.read(headBuf, 0, 4100, 0);
			await fd.close();
			const detected = await fileTypeFromBuffer(headBuf);
			if (
				detected &&
				!ALLOWED_IMAGE_MIMES.has(detected.mime) &&
				!ALLOWED_VIDEO_MIMES.has(detected.mime)
			) {
				await fs.unlink(origAbsPath).catch(() => {});
				return json({ error: 'File signature failed security validation.' }, { status: 400 });
			}

			const sha256 = hash.digest('hex');
			const stat = await fs.stat(origAbsPath);

			await db
				.update(mediaItems)
				.set({
					status: 'processing',
					sha256,
					sizeBytes: stat.size
				})
				.where(eq(mediaItems.id, media.id));

			await db
				.update(uploadSessions)
				.set({ completedAt: new Date() })
				.where(eq(uploadSessions.id, session.id));

			// For images, process immediately so the feed post is instant; for videos, enqueue background job
			if (media.type === 'image') {
				await processMediaItem(media.id);
			} else {
				await enqueueJob('process_media', {
					mediaId: media.id,
					uploaderId: locals.user.id
				});
				// Also process in background for fast local dev
				await processMediaItem(media.id);
			}

			const [updated] = await db
				.select()
				.from(mediaItems)
				.where(eq(mediaItems.id, media.id))
				.limit(1);

			return json({ media: formatMediaForClient(updated) });
		}
	}

	// Mode B: Multipart FormData Direct Upload
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const altText = String(formData.get('altText') || '').trim();
	const keepExif = locals.user.role === 'child' ? false : formData.get('keepExif') === 'true';

	if (!file) {
		return json({ error: 'No file provided.' }, { status: 400 });
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	const detected = await fileTypeFromBuffer(buffer);
	const mimeType = (detected?.mime || file.type || 'image/jpeg').toLowerCase();

	const isImage = ALLOWED_IMAGE_MIMES.has(mimeType);
	const isVideo = ALLOWED_VIDEO_MIMES.has(mimeType);
	if (!isImage && !isVideo) {
		return json({ error: `Unsupported media format: ${mimeType}` }, { status: 400 });
	}

	const mediaId = crypto.randomUUID();
	const ext = detected?.ext ? `.${detected.ext}` : isImage ? '.jpg' : '.mp4';
	const originalRelPath = `originals/${mediaId}${ext}`;
	const origAbsPath = resolveMediaRelPath(originalRelPath);

	await fs.writeFile(origAbsPath, buffer);
	const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

	await db.insert(mediaItems).values({
		id: mediaId,
		uploaderId: locals.user.id,
		type: isImage ? 'image' : 'video',
		status: 'processing',
		originalRelPath,
		sizeBytes: buffer.length,
		mimeType,
		sha256,
		altText,
		keepExif
	});

	await processMediaItem(mediaId);

	const [readyItem] = await db
		.select()
		.from(mediaItems)
		.where(eq(mediaItems.id, mediaId))
		.limit(1);

	return json({ media: formatMediaForClient(readyItem) });
};

/**
 * PATCH /api/media/upload?uploadId=...&chunkIndex=...
 * Uploads an individual binary chunk for resumable video/photo uploads.
 */
export const PATCH: RequestHandler = async ({ request, url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const uploadId = url.searchParams.get('uploadId') || '';
	const chunkIndex = Number(url.searchParams.get('chunkIndex') || 0);

	const sessions = await db
		.select()
		.from(uploadSessions)
		.where(
			and(eq(uploadSessions.id, uploadId), eq(uploadSessions.uploaderId, locals.user.id))
		)
		.limit(1);

	if (sessions.length === 0) {
		return json({ error: 'Upload session not found.' }, { status: 404 });
	}

	const session = sessions[0];
	const chunkBuffer = Buffer.from(await request.arrayBuffer());
	const chunkPath = path.join(
		resolveMediaRelPath(session.tempDirRelPath),
		`chunk_${chunkIndex}`
	);

	await fs.writeFile(chunkPath, chunkBuffer);
	await db
		.update(uploadSessions)
		.set({ uploadedChunks: Math.min(session.totalChunks, session.uploadedChunks + 1) })
		.where(eq(uploadSessions.id, session.id));

	return json({
		uploadId,
		chunkIndex,
		receivedBytes: chunkBuffer.length
	});
};
