import crypto from 'node:crypto';

const DEFAULT_SECRET = 'dev_media_signing_secret_for_hmac_urls_11223344556677889900ffeeddcc';

function getSigningSecret(): string {
	return process.env.MEDIA_SIGNING_SECRET || DEFAULT_SECRET;
}

export type MediaVariant = 'thumb' | 'webp' | 'avif' | 'mp4' | 'hls' | 'original';

/**
 * Generates an HMAC-SHA256 signed URL for a media item & variant.
 * Prevents unauthenticated or URL-guessing access to family photos/videos.
 */
export function signMediaUrl(
	mediaId: string,
	variant: MediaVariant = 'webp',
	ttlSeconds = 60 * 60 * 12 // 12 hours
): string {
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
	const payload = `${mediaId}:${variant}:${exp}`;
	const sig = crypto
		.createHmac('sha256', getSigningSecret())
		.update(payload)
		.digest('base64url');
	return `/api/media/${mediaId}/${variant}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(
	mediaId: string,
	variant: string,
	expStr: string | null,
	sig: string | null
): boolean {
	if (!expStr || !sig) return false;
	const exp = Number(expStr);
	if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
		return false;
	}
	const payload = `${mediaId}:${variant}:${exp}`;
	const expectedSig = crypto
		.createHmac('sha256', getSigningSecret())
		.update(payload)
		.digest('base64url');

	const a = Buffer.from(sig);
	const b = Buffer.from(expectedSig);
	if (a.length !== b.length) return false;
	return crypto.timingSafeEqual(a, b);
}

export function formatMediaForClient(item: {
	id: string;
	type: 'image' | 'video';
	status: string;
	width: number;
	height: number;
	durationSec: number;
	altText: string;
	keepExif: boolean;
	exifData?: Record<string, unknown> | null;
	takenAt?: Date;
}) {
	return {
		id: item.id,
		type: item.type,
		status: item.status,
		width: item.width,
		height: item.height,
		durationSec: item.durationSec,
		altText: item.altText || 'Family photo',
		thumbUrl: signMediaUrl(item.id, 'thumb'),
		displayUrl: signMediaUrl(item.id, item.type === 'video' ? 'mp4' : 'webp'),
		avifUrl: item.type === 'image' ? signMediaUrl(item.id, 'avif') : null,
		hlsUrl: item.type === 'video' ? signMediaUrl(item.id, 'hls') : null,
		originalUrl: signMediaUrl(item.id, 'original'),
		exifData: item.keepExif ? item.exifData : null,
		takenAt: item.takenAt ? item.takenAt.toISOString() : null
	};
}
