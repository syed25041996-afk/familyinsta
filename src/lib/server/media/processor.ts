import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import ExifReader from 'exifreader';
import { db, ensureSchema } from '../db/index.js';
import { mediaItems } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { log } from '../logger.js';

const execFileAsync = promisify(execFile);

export function getMediaRoot(): string {
	return path.resolve(process.env.MEDIA_ROOT || './data/media');
}

export async function ensureMediaDirs(): Promise<void> {
	const root = getMediaRoot();
	for (const sub of ['originals', 'display', 'thumbs', 'hls', 'chunks']) {
		await fs.mkdir(path.join(root, sub), { recursive: true });
	}
}

export function resolveMediaRelPath(relPath: string): string {
	const root = getMediaRoot();
	const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
	return path.join(root, normalized);
}

// -----------------------------------------------------------------------------
// 1. Optional ClamAV Virus Scan Hook (INSTREAM TCP protocol)
// -----------------------------------------------------------------------------
export async function scanFileWithClamAV(filePath: string): Promise<{ clean: boolean; reason?: string }> {
	if (process.env.CLAMAV_ENABLED !== 'true') {
		return { clean: true };
	}

	const host = process.env.CLAMAV_HOST || 'clamav';
	const port = Number(process.env.CLAMAV_PORT || 3310);

	return new Promise((resolve) => {
		const socket = net.createConnection({ host, port, timeout: 10000 }, () => {
			socket.write('zINSTREAM\0');
			const stream = fsSync.createReadStream(filePath, { highWaterMark: 64 * 1024 });
			stream.on('data', (chunk: Buffer) => {
				const lenBuf = Buffer.alloc(4);
				lenBuf.writeUInt32BE(chunk.length, 0);
				socket.write(lenBuf);
				socket.write(chunk);
			});
			stream.on('end', () => {
				const endBuf = Buffer.alloc(4, 0);
				socket.write(endBuf);
			});
		});

		let response = '';
		socket.on('data', (data) => {
			response += data.toString();
		});
		socket.on('end', () => {
			if (response.includes('OK') && !response.includes('FOUND')) {
				resolve({ clean: true });
			} else {
				resolve({ clean: false, reason: response.trim() });
			}
		});
		socket.on('error', (err) => {
			log('warn', 'clamav_unavailable_fallback', { error: err.message });
			resolve({ clean: true });
		});
	});
}

// -----------------------------------------------------------------------------
// 2. EXIF Metadata Extraction (Preserved in DB; stripped from display files)
// -----------------------------------------------------------------------------
export async function extractExifData(filePath: string): Promise<{
	takenAt: Date;
	exifData: {
		camera?: string;
		dateTaken?: string;
		latitude?: number;
		longitude?: number;
		iso?: number;
		aperture?: string;
	};
}> {
	try {
		const buffer = await fs.readFile(filePath);
		const tags = ExifReader.load(buffer, { expanded: true });
		const exif = tags.exif || {};
		const gps = tags.gps || {};

		const make = exif.Make?.description || '';
		const model = exif.Model?.description || '';
		const camera = [make, model].filter(Boolean).join(' ').trim() || undefined;
		const dateStr = exif.DateTimeOriginal?.description || exif.DateTime?.description;

		let takenAt = new Date();
		if (dateStr) {
			// Format: YYYY:MM:DD HH:MM:SS
			const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
			const parsed = new Date(normalized);
			if (!Number.isNaN(parsed.getTime())) {
				takenAt = parsed;
			}
		}

		return {
			takenAt,
			exifData: {
				camera,
				dateTaken: takenAt.toISOString(),
				latitude: typeof gps.Latitude === 'number' ? Number(gps.Latitude.toFixed(5)) : undefined,
				longitude: typeof gps.Longitude === 'number' ? Number(gps.Longitude.toFixed(5)) : undefined,
				iso: exif.ISOSpeedRatings?.value ? Number(exif.ISOSpeedRatings.value) : undefined,
				aperture: exif.FNumber?.description
			}
		};
	} catch {
		return {
			takenAt: new Date(),
			exifData: {}
		};
	}
}

// -----------------------------------------------------------------------------
// 3. Process Media Item (Sharp Image WebP/AVIF & FFmpeg Video H.264/HLS)
// -----------------------------------------------------------------------------
export async function processMediaItem(mediaId: string): Promise<void> {
	await ensureSchema();
	await ensureMediaDirs();

	const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaId)).limit(1);
	if (rows.length === 0) return;
	const item = rows[0];

	const origAbsPath = resolveMediaRelPath(item.originalRelPath);

	try {
		await db
			.update(mediaItems)
			.set({ status: 'processing' })
			.where(eq(mediaItems.id, mediaId));

		// 1. Optional ClamAV Virus Check
		const scan = await scanFileWithClamAV(origAbsPath);
		if (!scan.clean) {
			await db
				.update(mediaItems)
				.set({ status: 'quarantined' })
				.where(eq(mediaItems.id, mediaId));
			log('error', 'media_quarantined', { mediaId, reason: scan.reason });
			return;
		}

		if (item.type === 'image') {
			const { takenAt, exifData } = await extractExifData(origAbsPath);

			// Sharp automatically strips EXIF/GPS metadata unless .withMetadata() is called!
			// We intentionally DO NOT call .withMetadata() on display/thumb copies so GPS/EXIF is stripped.
			const image = sharp(origAbsPath).rotate(); // Auto-orient based on EXIF orientation
			const metadata = await image.metadata();
			const width = metadata.width || 1080;
			const height = metadata.height || 1080;

			const thumbRel = `thumbs/${mediaId}.webp`;
			const webpRel = `display/${mediaId}.webp`;
			const avifRel = `display/${mediaId}.avif`;

			// Generate 400x400 cover thumbnail
			await sharp(origAbsPath)
				.rotate()
				.resize(400, 400, { fit: 'cover' })
				.webp({ quality: 80 })
				.toFile(resolveMediaRelPath(thumbRel));

			// Generate 1920px max WebP display version (EXIF stripped)
			await sharp(origAbsPath)
				.rotate()
				.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
				.webp({ quality: 84 })
				.toFile(resolveMediaRelPath(webpRel));

			// Generate 1920px max AVIF display version (EXIF stripped)
			await sharp(origAbsPath)
				.rotate()
				.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
				.avif({ quality: 68, effort: 2 })
				.toFile(resolveMediaRelPath(avifRel));

			await db
				.update(mediaItems)
				.set({
					status: 'ready',
					width,
					height,
					thumbRelPath: thumbRel,
					displayWebpRelPath: webpRel,
					displayAvifRelPath: avifRel,
					takenAt,
					exifData: item.keepExif
						? exifData
						: { camera: exifData.camera, dateTaken: exifData.dateTaken }
				})
				.where(eq(mediaItems.id, mediaId));
		} else {
			// Video processing via ffmpeg (with fallback if ffmpeg is not installed on host)
			const thumbRel = `thumbs/${mediaId}.webp`;
			const mp4Rel = `display/${mediaId}.mp4`;
			const hlsDirRel = `hls/${mediaId}`;
			const hlsPlaylistRel = `${hlsDirRel}/master.m3u8`;

			let ffmpegAvailable = false;
			try {
				await execFileAsync('ffmpeg', ['-version']);
				ffmpegAvailable = true;
			} catch {
				ffmpegAvailable = false;
			}

			if (ffmpegAvailable) {
				const tempFramePath = resolveMediaRelPath(`chunks/${mediaId}_poster.jpg`);
				try {
					await execFileAsync('ffmpeg', [
						'-y',
						'-ss',
						'00:00:00.500',
						'-i',
						origAbsPath,
						'-frames:v',
						'1',
						'-q:v',
						'2',
						tempFramePath
					]);
					await sharp(tempFramePath)
						.resize(400, 400, { fit: 'cover' })
						.webp({ quality: 80 })
						.toFile(resolveMediaRelPath(thumbRel));
					await fs.unlink(tempFramePath).catch(() => {});
				} catch {
					await createFallbackVideoPoster(resolveMediaRelPath(thumbRel));
				}

				// Transcode to H.264 MP4 with faststart & stripped GPS metadata (-map_metadata -1)
				await execFileAsync('ffmpeg', [
					'-y',
					'-i',
					origAbsPath,
					'-map_metadata',
					'-1',
					'-vf',
					"scale='min(1280,iw)':-2",
					'-c:v',
					'libx264',
					'-preset',
					'veryfast',
					'-crf',
					'23',
					'-pix_fmt',
					'yuv420p',
					'-c:a',
					'aac',
					'-b:a',
					'128k',
					'-movflags',
					'+faststart',
					resolveMediaRelPath(mp4Rel)
				]);

				// Also generate HLS playlist for adaptive streaming
				await fs.mkdir(resolveMediaRelPath(hlsDirRel), { recursive: true });
				await execFileAsync('ffmpeg', [
					'-y',
					'-i',
					resolveMediaRelPath(mp4Rel),
					'-codec:',
					'copy',
					'-start_number',
					'0',
					'-hls_time',
					'6',
					'-hls_list_size',
					'0',
					'-f',
					'hls',
					resolveMediaRelPath(hlsPlaylistRel)
				]).catch(() => {});
			} else {
				// Graceful dev fallback when ffmpeg is not installed locally
				await fs.copyFile(origAbsPath, resolveMediaRelPath(mp4Rel));
				await createFallbackVideoPoster(resolveMediaRelPath(thumbRel));
			}

			await db
				.update(mediaItems)
				.set({
					status: 'ready',
					thumbRelPath: thumbRel,
					videoMp4RelPath: mp4Rel,
					videoHlsRelPath: ffmpegAvailable ? hlsPlaylistRel : null
				})
				.where(eq(mediaItems.id, mediaId));
		}

		log('info', 'media_processed_successfully', { mediaId, type: item.type });
	} catch (err) {
		log('error', 'media_processing_failed', {
			mediaId,
			error: err instanceof Error ? err.message : String(err)
		});
		await db
			.update(mediaItems)
			.set({ status: 'failed' })
			.where(eq(mediaItems.id, mediaId));
	}
}

async function createFallbackVideoPoster(targetPath: string) {
	const svg = `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
		<rect width="400" height="400" fill="#1e293b"/>
		<circle cx="200" cy="200" r="56" fill="#dc5b4d"/>
		<polygon points="185,170 185,230 235,200" fill="#ffffff"/>
	</svg>`;
	await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(targetPath);
}
