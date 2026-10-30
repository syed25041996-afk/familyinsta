import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { db, ensureSchema } from '../src/lib/server/db/index.js';
import {
	users,
	invites,
	childApprovedContacts,
	mediaItems,
	posts,
	postMedia,
	postTags,
	reactions,
	comments,
	stories,
	storyViews,
	highlights,
	highlightItems,
	albums,
	albumContributors,
	albumMedia,
	conversations,
	conversationMembers,
	messages,
	notificationPreferences
} from '../src/lib/server/db/schema.js';
import { hashPassword } from '../src/lib/server/auth/index.js';
import {
	ensureMediaDirs,
	resolveMediaRelPath,
	processMediaItem
} from '../src/lib/server/media/processor.js';
import { eq } from 'drizzle-orm';

async function createSampleImage(params: {
	uploaderId: string;
	title: string;
	subtitle: string;
	bgStart: string;
	bgEnd: string;
	altText: string;
	takenAt?: Date;
}): Promise<string> {
	const mediaId = crypto.randomUUID();
	const originalRelPath = `originals/${mediaId}.jpg`;
	const absPath = resolveMediaRelPath(originalRelPath);

	const safeTitle = params.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const safeSubtitle = params.subtitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	const svg = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="${params.bgStart}" />
				<stop offset="100%" stop-color="${params.bgEnd}" />
			</linearGradient>
		</defs>
		<rect width="1200" height="900" fill="url(#g)" />
		<circle cx="980" cy="180" r="110" fill="rgba(255,255,255,0.18)" />
		<circle cx="200" cy="750" r="180" fill="rgba(255,255,255,0.12)" />
		<rect x="90" y="540" width="1020" height="260" rx="36" fill="rgba(0,0,0,0.38)" />
		<text x="140" y="645" font-family="sans-serif" font-size="56" font-weight="bold" fill="#ffffff">${safeTitle}</text>
		<text x="140" y="725" font-family="sans-serif" font-size="34" fill="#f5f5f4">${safeSubtitle}</text>
	</svg>`;

	const jpgBuffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
	await fs.writeFile(absPath, jpgBuffer);

	await db.insert(mediaItems).values({
		id: mediaId,
		uploaderId: params.uploaderId,
		type: 'image',
		status: 'processing',
		originalRelPath,
		sizeBytes: jpgBuffer.length,
		mimeType: 'image/jpeg',
		sha256: crypto.createHash('sha256').update(jpgBuffer).digest('hex'),
		altText: params.altText,
		keepExif: true,
		takenAt: params.takenAt || new Date()
	});

	await processMediaItem(mediaId);
	if (params.takenAt) {
		await db
			.update(mediaItems)
			.set({
				takenAt: params.takenAt,
				exifData: {
					camera: 'Fujifilm X100VI',
					dateTaken: params.takenAt.toISOString()
				}
			})
			.where(eq(mediaItems.id, mediaId));
	}

	return mediaId;
}

export async function seedFamilyData() {
	await ensureSchema();
	await ensureMediaDirs();

	const existing = await db.select().from(users).where(eq(users.username, 'aarav')).limit(1);
	if (existing.length > 0) {
		console.log('Demo family data already seeded.');
		return;
	}

	console.log('Seeding Kinship demo family data...');
	const commonPasswordHash = await hashPassword('FamilyVault2026!');

	// 1. Create Family Members
	const [aarav] = await db
		.insert(users)
		.values({
			email: 'aarav@family.local',
			username: 'aarav',
			passwordHash: commonPasswordHash,
			displayName: 'Aarav Sharma',
			relationshipLabel: 'Admin / Son',
			bio: 'Self-hosting our family memories on the home lab Proxmox server 🖥️❤️',
			role: 'admin',
			locale: 'en',
			textScale: 'normal'
		})
		.returning();

	const [nani] = await db
		.insert(users)
		.values({
			email: 'nani@family.local',
			username: 'nani',
			passwordHash: commonPasswordHash,
			displayName: 'Kamala Devi (Nani)',
			relationshipLabel: 'Nani (Grandma)',
			bio: 'Blessings to all my grandchildren 🙏 Mango pickle & stories always ready.',
			role: 'member',
			locale: 'hi',
			textScale: 'xlarge'
		})
		.returning();

	const [priya] = await db
		.insert(users)
		.values({
			email: 'priya@family.local',
			username: 'priya',
			passwordHash: commonPasswordHash,
			displayName: 'Priya Sharma',
			relationshipLabel: 'Mom',
			bio: 'Garden lover, chai enthusiast & family archivist 🌿☕',
			role: 'member',
			locale: 'en',
			textScale: 'normal'
		})
		.returning();

	const [rohan] = await db
		.insert(users)
		.values({
			email: 'rohan@family.local',
			username: 'rohan',
			passwordHash: commonPasswordHash,
			displayName: 'Rohan Verma',
			relationshipLabel: 'Cousin',
			bio: 'Weekend treks & cousin board game champion 🎲🏔️',
			role: 'member',
			locale: 'en',
			textScale: 'normal'
		})
		.returning();

	const [ananya] = await db
		.insert(users)
		.values({
			email: 'ananya@family.local',
			username: 'ananya',
			passwordHash: commonPasswordHash,
			displayName: 'Ananya Sharma',
			relationshipLabel: 'Little Sister',
			bio: 'Drawing, cycling & robotics club 🎨🤖',
			role: 'child',
			locale: 'en',
			textScale: 'normal'
		})
		.returning();

	for (const u of [aarav, nani, priya, rohan, ananya]) {
		await db.insert(notificationPreferences).values({ userId: u.id }).onConflictDoNothing();
	}

	// 2. Configure Child Safety Circle for Ananya (Approved: Aarav, Mom, Nani; Rohan not yet approved so Child circle restriction can be tested!)
	for (const approvedUser of [aarav, priya, nani]) {
		await db.insert(childApprovedContacts).values({
			childUserId: ananya.id,
			contactUserId: approvedUser.id,
			status: 'approved',
			approvedById: aarav.id
		});
	}

	// 3. Create One-Time Invite Codes
	const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	await db.insert(invites).values([
		{
			code: 'DIWALI-2026',
			assignedRole: 'member',
			defaultRelationshipLabel: 'Mausi (Aunt)',
			note: 'Join our private family photo vault!',
			createdById: aarav.id,
			expiresAt: nextWeek
		},
		{
			code: 'CHACHA-JOIN',
			assignedRole: 'member',
			defaultRelationshipLabel: 'Chacha (Uncle)',
			note: 'Welcome to Kinship Family!',
			createdById: aarav.id,
			expiresAt: nextWeek
		},
		{
			code: 'KIDDO-SAFE',
			assignedRole: 'child',
			defaultRelationshipLabel: 'Younger Cousin',
			note: 'Child-safe account with parent-approved circle',
			createdById: aarav.id,
			expiresAt: nextWeek
		}
	]);

	// 4. Generate Sample Family Media
	const diwaliImg1 = await createSampleImage({
		uploaderId: priya.id,
		title: 'Diwali Evening at Home',
		subtitle: 'Clay diyas & rangoli on the veranda',
		bgStart: '#c84031',
		bgEnd: '#f59e0b',
		altText: 'Glowing clay diyas and colorful rangoli on the veranda for Diwali'
	});

	const diwaliImg2 = await createSampleImage({
		uploaderId: priya.id,
		title: 'Homemade Kaju Katli & Laddoos',
		subtitle: 'Made from Nani’s handwritten recipe book',
		bgStart: '#b45309',
		bgEnd: '#78350f',
		altText: 'Platter of homemade Diwali sweets and laddoos'
	});

	const naniPostImg = await createSampleImage({
		uploaderId: nani.id,
		title: 'Fresh Terrace Marigolds',
		subtitle: 'Morning sunshine in Mysuru',
		bgStart: '#047857',
		bgEnd: '#064e3b',
		altText: 'Bright orange marigold flowers blooming on Nani terrace garden'
	});

	const now = new Date();
	const oneYearAgoToday = new Date(
		now.getFullYear() - 1,
		now.getMonth(),
		now.getDate(),
		14,
		30,
		0
	);

	const memoryImg = await createSampleImage({
		uploaderId: aarav.id,
		title: 'Nani’s 75th Birthday Reunion',
		subtitle: 'All 14 cousins together in one frame!',
		bgStart: '#4f46e5',
		bgEnd: '#9333ea',
		altText: 'Extended family gathered around Nani for her 75th birthday cake',
		takenAt: oneYearAgoToday
	});

	// 5. Create Chronological Posts + "On This Day" Memory Post
	const [memoryPost] = await db
		.insert(posts)
		.values({
			authorId: aarav.id,
			caption:
				'Looking back at Nani’s 75th birthday celebration with everyone under one roof! #nanis75th #familyreunion @nani @priya',
			locationName: 'Ancestral Home, Mysuru',
			keepExif: true,
			createdAt: oneYearAgoToday,
			updatedAt: oneYearAgoToday
		})
		.returning();

	await db.insert(postMedia).values({
		postId: memoryPost.id,
		mediaId: memoryImg,
		sortOrder: 0
	});
	await db.insert(postTags).values([
		{ postId: memoryPost.id, tag: 'nanis75th' },
		{ postId: memoryPost.id, tag: 'familyreunion' }
	]);

	const [naniPost] = await db
		.insert(posts)
		.values({
			authorId: nani.id,
			caption:
				'First batch of terrace marigolds bloomed this morning! Saving seeds for @priya and @ananya 🌼 #garden #mysuru',
			locationName: 'Mysuru Terrace',
			keepExif: false,
			createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
		})
		.returning();

	await db.insert(postMedia).values({
		postId: naniPost.id,
		mediaId: naniPostImg,
		sortOrder: 0
	});
	await db.insert(postTags).values([
		{ postId: naniPost.id, tag: 'garden' },
		{ postId: naniPost.id, tag: 'mysuru' }
	]);

	const [diwaliPost] = await db
		.insert(posts)
		.values({
			authorId: priya.id,
			caption:
				'Diwali prep in full swing! Swipe to see the sweets @ananya and @aarav helped roll ✨🪔 #diwali2026 #familytradition',
			locationName: 'Bengaluru Home',
			keepExif: true,
			createdAt: new Date(Date.now() - 45 * 60 * 1000)
		})
		.returning();

	await db.insert(postMedia).values([
		{ postId: diwaliPost.id, mediaId: diwaliImg1, sortOrder: 0 },
		{ postId: diwaliPost.id, mediaId: diwaliImg2, sortOrder: 1 }
	]);
	await db.insert(postTags).values([
		{ postId: diwaliPost.id, tag: 'diwali2026' },
		{ postId: diwaliPost.id, tag: 'familytradition' }
	]);

	// Reactions & Threaded Comments
	await db.insert(reactions).values([
		{ postId: diwaliPost.id, userId: aarav.id, emoji: '❤️' },
		{ postId: diwaliPost.id, userId: nani.id, emoji: '🙏' },
		{ postId: diwaliPost.id, userId: ananya.id, emoji: '🎉' },
		{ postId: naniPost.id, userId: priya.id, emoji: '❤️' }
	]);

	const [topComment] = await db
		.insert(comments)
		.values({
			postId: diwaliPost.id,
			authorId: nani.id,
			body: 'So proud of you all! Save two besan laddoos for me 🙏❤️'
		})
		.returning();

	await db.insert(comments).values({
		postId: diwaliPost.id,
		authorId: priya.id,
		parentCommentId: topComment.id,
		body: 'Already packed a whole tin for you @nani!'
	});

	// 6. Active 24-Hour Stories & Saved Highlights
	const tomorrow = new Date(Date.now() + 22 * 60 * 60 * 1000);
	const [story1] = await db
		.insert(stories)
		.values({
			authorId: priya.id,
			mediaId: diwaliImg1,
			caption: 'Lighting the first diya on the balcony 🪔',
			expiresAt: tomorrow
		})
		.returning();

	const [story2] = await db
		.insert(stories)
		.values({
			authorId: nani.id,
			mediaId: naniPostImg,
			caption: 'Good morning from Mysuru! 🌺',
			expiresAt: tomorrow
		})
		.returning();

	await db.insert(storyViews).values([
		{ storyId: story1.id, viewerId: aarav.id },
		{ storyId: story1.id, viewerId: nani.id }
	]);

	const [hl] = await db
		.insert(highlights)
		.values({
			userId: priya.id,
			title: 'Festivals',
			coverMediaId: diwaliImg1
		})
		.returning();

	await db.insert(highlightItems).values({
		highlightId: hl.id,
		storyId: story1.id
	});

	// 7. Shared Family Albums
	const [diwaliAlbum] = await db
		.insert(albums)
		.values({
			ownerId: priya.id,
			title: 'Diwali 2026 Family Album',
			description: 'All photos & videos from our family Diwali celebration',
			coverMediaId: diwaliImg1
		})
		.returning();

	await db.insert(albumContributors).values([
		{ albumId: diwaliAlbum.id, userId: aarav.id },
		{ albumId: diwaliAlbum.id, userId: nani.id },
		{ albumId: diwaliAlbum.id, userId: rohan.id }
	]);

	await db.insert(albumMedia).values([
		{ albumId: diwaliAlbum.id, mediaId: diwaliImg1, addedById: priya.id },
		{ albumId: diwaliAlbum.id, mediaId: diwaliImg2, addedById: priya.id },
		{ albumId: diwaliAlbum.id, mediaId: memoryImg, addedById: aarav.id }
	]);

	// 8. Family Group Chat with Read Receipts
	const [familyChat] = await db
		.insert(conversations)
		.values({
			type: 'group',
			title: 'Sharma Family Adda 🏡',
			createdById: aarav.id
		})
		.returning();

	for (const u of [aarav, nani, priya, ananya]) {
		await db.insert(conversationMembers).values({
			conversationId: familyChat.id,
			userId: u.id
		});
	}

	await db.insert(messages).values([
		{
			conversationId: familyChat.id,
			senderId: nani.id,
			body: 'What time is everyone arriving on Sunday for lunch?'
		},
		{
			conversationId: familyChat.id,
			senderId: priya.id,
			body: 'We will reach by 12:30 PM! Bringing hot gulab jamuns.'
		},
		{
			conversationId: familyChat.id,
			senderId: aarav.id,
			body: 'Just uploaded the new album to our home server — zero cloud fees!',
			mediaId: diwaliImg1
		}
	]);

	console.log('Seeded 5 family members, posts, stories, albums, memories, and chats!');
}

// Allow running directly via `npm run db:seed`
if (process.argv[1]?.endsWith('seed.ts')) {
	seedFamilyData()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
