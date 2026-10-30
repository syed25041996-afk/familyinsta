import { describe, it, expect, beforeAll } from 'vitest';

// Use in-memory PostgreSQL (PGlite) for fast, isolated test execution
process.env.DATABASE_URL = 'pglite://memory://';
process.env.MEDIA_SIGNING_SECRET = 'test_secret_key_for_hmac_signed_media_urls_1234567890';
process.env.MEDIA_ROOT = './data/test_media';

import {
	hashPassword,
	verifyPassword,
	checkRateLimit,
	clearRateLimit,
	generateInviteCode,
	validateInviteCode,
	registerUserWithInvite,
	getVisibleUserIdsForViewer,
	canUsersInteract
} from '../../src/lib/server/auth/index.js';
import { signMediaUrl, verifyMediaSignature } from '../../src/lib/server/media/signer.js';
import {
	ensureMediaDirs,
	resolveMediaRelPath,
	processMediaItem
} from '../../src/lib/server/media/processor.js';
import { executeManagedBackup } from '../../src/lib/server/queue/index.js';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {
	extractHashtags,
	extractMentions,
	createFamilyPost,
	getChronologicalFeed
} from '../../src/lib/server/services/social.js';
import { t } from '../../src/lib/i18n/index.js';
import { db, ensureSchema } from '../../src/lib/server/db/index.js';
import { users, invites, childApprovedContacts, mediaItems } from '../../src/lib/server/db/schema.js';

describe('Kinship Security, Auth, Child Safety & Social Pipeline', () => {
	beforeAll(async () => {
		await ensureSchema();
	});

	it('hashes and verifies passwords with Argon2id', async () => {
		const hash = await hashPassword('MySuperSecretFamilyPass!');
		expect(hash).toContain('$argon2');
		expect(await verifyPassword(hash, 'MySuperSecretFamilyPass!')).toBe(true);
		expect(await verifyPassword(hash, 'WrongPassword')).toBe(false);
	});

	it('enforces login rate limiting and clears on success', () => {
		const key = 'test-ip:user@family.local';
		clearRateLimit(key);
		for (let i = 0; i < 6; i++) {
			expect(checkRateLimit(key, 6, 60000).allowed).toBe(true);
		}
		const blocked = checkRateLimit(key, 6, 60000);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSec).toBeGreaterThan(0);

		clearRateLimit(key);
		expect(checkRateLimit(key, 6, 60000).allowed).toBe(true);
	});

	it('signs media URLs with HMAC-SHA256 and rejects tampered or expired signatures', () => {
		const mediaId = '11111111-2222-3333-4444-555555555555';
		const signed = signMediaUrl(mediaId, 'webp', 3600);
		const url = new URL(signed, 'http://localhost:3000');
		const exp = url.searchParams.get('exp');
		const sig = url.searchParams.get('sig');

		expect(verifyMediaSignature(mediaId, 'webp', exp, sig)).toBe(true);
		// Tamper with variant
		expect(verifyMediaSignature(mediaId, 'original', exp, sig)).toBe(false);
		// Tamper with signature
		expect(verifyMediaSignature(mediaId, 'webp', exp, `${sig}tampered`)).toBe(false);
		// Expired URL
		const expiredUrl = new URL(signMediaUrl(mediaId, 'webp', -10), 'http://localhost:3000');
		expect(
			verifyMediaSignature(
				mediaId,
				'webp',
				expiredUrl.searchParams.get('exp'),
				expiredUrl.searchParams.get('sig')
			)
		).toBe(false);
	});

	it('extracts hashtags and @mentions accurately', () => {
		const caption = 'Celebrating #Diwali2026 at #Mysuru with @nani and @aarav_sharma!';
		expect(extractHashtags(caption)).toEqual(['diwali2026', 'mysuru']);
		expect(extractMentions(caption)).toEqual(['nani', 'aarav_sharma']);
	});

	it('translates UI labels across English, Hindi, Kannada, and Tamil', () => {
		expect(t('en', 'onThisDay')).toBe('On This Day');
		expect(t('hi', 'onThisDay')).toContain('आज के दिन');
		expect(t('kn', 'onThisDay')).toContain('ನೆನಪುಗಳು');
		expect(t('ta', 'onThisDay')).toContain('நினைவுகள்');
	});

	it('enforces invite-only signup and strict Child Account visibility circles', async () => {
		const pwHash = await hashPassword('AdminPass123!');
		const [admin] = await db
			.insert(users)
			.values({
				email: 'admin@test.local',
				username: 'adminuser',
				passwordHash: pwHash,
				displayName: 'Admin Parent',
				relationshipLabel: 'Dad',
				role: 'admin'
			})
			.returning();

		// Create an invite for a regular relative (Uncle) and a Child account
		const uncleCode = generateInviteCode('UNCLE');
		const childCode = generateInviteCode('KID');
		const expiresAt = new Date(Date.now() + 86400000);

		await db.insert(invites).values([
			{
				code: uncleCode,
				assignedRole: 'member',
				defaultRelationshipLabel: 'Chacha',
				createdById: admin.id,
				expiresAt
			},
			{
				code: childCode,
				assignedRole: 'child',
				defaultRelationshipLabel: 'Daughter',
				createdById: admin.id,
				expiresAt
			}
		]);

		expect(await validateInviteCode(uncleCode)).not.toBeNull();

		const uncle = await registerUserWithInvite({
			inviteCode: uncleCode,
			email: 'uncle@test.local',
			username: 'unclebob',
			password: 'UnclePassword123!',
			displayName: 'Uncle Bob'
		});

		// One-time invite cannot be reused
		expect(await validateInviteCode(uncleCode)).toBeNull();

		const child = await registerUserWithInvite({
			inviteCode: childCode,
			email: 'kid@test.local',
			username: 'kiddo',
			password: 'KidPassword123!',
			displayName: 'Little Kiddo'
		});

		expect(child.role).toBe('child');

		// Uncle creates a post
		const [dummyMedia] = await db
			.insert(mediaItems)
			.values({
				uploaderId: uncle.id,
				type: 'image',
				status: 'ready',
				originalRelPath: 'originals/test.jpg',
				mimeType: 'image/jpeg',
				altText: 'Test image'
			})
			.returning();

		await createFamilyPost({
			author: uncle,
			mediaIds: [dummyMedia.id],
			caption: 'Hello from Uncle! #family'
		});

		// Before Admin approves Uncle for Child, Child CANNOT see Uncle's post or interact
		expect(await canUsersInteract(child, uncle)).toBe(false);
		const childFeedBefore = await getChronologicalFeed(child);
		expect(childFeedBefore.length).toBe(0);

		// Admin approves Uncle in child_approved_contacts
		await db.insert(childApprovedContacts).values({
			childUserId: child.id,
			contactUserId: uncle.id,
			status: 'approved',
			approvedById: admin.id
		});

		expect(await canUsersInteract(child, uncle)).toBe(true);
		const childFeedAfter = await getVisibleUserIdsForViewer(child);
		expect(childFeedAfter).toContain(uncle.id);

		const feedAfter = await getChronologicalFeed(child);
		expect(feedAfter.length).toBe(1);
		expect(feedAfter[0].caption).toContain('Hello from Uncle!');

		// Test Media Pipeline (WebP, AVIF, Thumbnail generation) & Automated Backup Snapshot
		await ensureMediaDirs();
		const testMediaId = '99999999-8888-7777-6666-555555555555';
		const origRel = `originals/${testMediaId}.jpg`;
		const sampleJpg = await sharp({
			create: {
				width: 800,
				height: 600,
				channels: 3,
				background: { r: 200, g: 64, b: 49 }
			}
		})
			.jpeg()
			.toBuffer();

		await fs.writeFile(resolveMediaRelPath(origRel), sampleJpg);
		await db.insert(mediaItems).values({
			id: testMediaId,
			uploaderId: admin.id,
			type: 'image',
			status: 'uploading',
			originalRelPath: origRel,
			sizeBytes: sampleJpg.length,
			mimeType: 'image/jpeg',
			altText: 'Generated test image'
		});

		await processMediaItem(testMediaId);

		const thumbStat = await fs.stat(resolveMediaRelPath(`thumbs/${testMediaId}.webp`));
		const webpStat = await fs.stat(resolveMediaRelPath(`display/${testMediaId}.webp`));
		const avifStat = await fs.stat(resolveMediaRelPath(`display/${testMediaId}.avif`));
		expect(thumbStat.size).toBeGreaterThan(0);
		expect(webpStat.size).toBeGreaterThan(0);
		expect(avifStat.size).toBeGreaterThan(0);

		const backupRes = await executeManagedBackup(admin.id);
		expect(backupRes.sizeBytes).toBeGreaterThan(0);
	});
});
