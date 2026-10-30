import {
	pgTable,
	uuid,
	text,
	boolean,
	integer,
	bigint,
	doublePrecision,
	timestamp,
	jsonb,
	uniqueIndex,
	index
} from 'drizzle-orm/pg-core';

// -----------------------------------------------------------------------------
// 1. Users, Sessions, Passkeys, Password Resets, Invites, Child Contacts
// -----------------------------------------------------------------------------
export const users = pgTable(
	'users',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		email: text('email').notNull().unique(),
		username: text('username').notNull().unique(),
		passwordHash: text('password_hash').notNull(),
		displayName: text('display_name').notNull(),
		relationshipLabel: text('relationship_label').default('Family').notNull(),
		bio: text('bio').default('').notNull(),
		role: text('role').$type<'admin' | 'member' | 'child'>().default('member').notNull(),
		avatarMediaId: uuid('avatar_media_id'),
		locale: text('locale').$type<'en' | 'hi' | 'kn' | 'ta'>().default('en').notNull(),
		textScale: text('text_scale').$type<'normal' | 'large' | 'xlarge'>().default('normal').notNull(),
		theme: text('theme').$type<'system' | 'light' | 'dark'>().default('system').notNull(),
		isActive: boolean('is_active').default(true).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		usernameIdx: uniqueIndex('users_username_idx').on(t.username),
		emailIdx: uniqueIndex('users_email_idx').on(t.email)
	})
);

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(), // SHA-256 hash of session token
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		csrfToken: text('csrf_token').notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		userIdx: index('sessions_user_idx').on(t.userId)
	})
);

export const passwordResets = pgTable('password_resets', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	createdByAdminId: uuid('created_by_admin_id').references(() => users.id, {
		onDelete: 'set null'
	}),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	usedAt: timestamp('used_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const invites = pgTable('invites', {
	id: uuid('id').defaultRandom().primaryKey(),
	code: text('code').notNull().unique(), // e.g. DIWALI-8F2K
	assignedRole: text('assigned_role').$type<'admin' | 'member' | 'child'>().default('member').notNull(),
	defaultRelationshipLabel: text('default_relationship_label').default('Family').notNull(),
	note: text('note').default('').notNull(),
	createdById: uuid('created_by_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	claimedById: uuid('claimed_by_id').references(() => users.id, { onDelete: 'set null' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	claimedAt: timestamp('claimed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const childApprovedContacts = pgTable(
	'child_approved_contacts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		childUserId: uuid('child_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		contactUserId: uuid('contact_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		status: text('status').$type<'pending' | 'approved'>().default('approved').notNull(),
		approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniquePair: uniqueIndex('child_contact_pair_idx').on(t.childUserId, t.contactUserId)
	})
);

// -----------------------------------------------------------------------------
// 2. Media Items & Resumable Upload Sessions
// -----------------------------------------------------------------------------
export const mediaItems = pgTable(
	'media_items',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		uploaderId: uuid('uploader_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type').$type<'image' | 'video'>().notNull(),
		status: text('status')
			.$type<'uploading' | 'processing' | 'ready' | 'failed' | 'quarantined'>()
			.default('uploading')
			.notNull(),
		originalRelPath: text('original_rel_path').notNull(),
		displayWebpRelPath: text('display_webp_rel_path'),
		displayAvifRelPath: text('display_avif_rel_path'),
		thumbRelPath: text('thumb_rel_path'),
		videoMp4RelPath: text('video_mp4_rel_path'),
		videoHlsRelPath: text('video_hls_rel_path'),
		width: integer('width').default(1080).notNull(),
		height: integer('height').default(1080).notNull(),
		durationSec: doublePrecision('duration_sec').default(0).notNull(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0).notNull(),
		mimeType: text('mime_type').notNull(),
		sha256: text('sha256').default('').notNull(),
		altText: text('alt_text').default('').notNull(),
		keepExif: boolean('keep_exif').default(false).notNull(),
		exifData: jsonb('exif_data').$type<{
			camera?: string;
			dateTaken?: string;
			latitude?: number;
			longitude?: number;
			iso?: number;
			aperture?: string;
		}>(),
		takenAt: timestamp('taken_at', { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uploaderIdx: index('media_uploader_idx').on(t.uploaderId),
		takenAtIdx: index('media_taken_at_idx').on(t.takenAt)
	})
);

export const uploadSessions = pgTable('upload_sessions', {
	id: uuid('id').defaultRandom().primaryKey(),
	mediaId: uuid('media_id')
		.notNull()
		.references(() => mediaItems.id, { onDelete: 'cascade' }),
	uploaderId: uuid('uploader_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	filename: text('filename').notNull(),
	mimeType: text('mime_type').notNull(),
	totalSizeBytes: bigint('total_size_bytes', { mode: 'number' }).notNull(),
	totalChunks: integer('total_chunks').notNull(),
	uploadedChunks: integer('uploaded_chunks').default(0).notNull(),
	tempDirRelPath: text('temp_dir_rel_path').notNull(),
	keepExif: boolean('keep_exif').default(false).notNull(),
	altText: text('alt_text').default('').notNull(),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// -----------------------------------------------------------------------------
// 3. Posts, Post Media, Tags, Mentions, Reactions, Comments
// -----------------------------------------------------------------------------
export const posts = pgTable(
	'posts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		authorId: uuid('author_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		caption: text('caption').default('').notNull(),
		locationName: text('location_name').default('').notNull(),
		keepExif: boolean('keep_exif').default(false).notNull(),
		isArchived: boolean('is_archived').default(false).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		authorIdx: index('posts_author_idx').on(t.authorId),
		createdAtIdx: index('posts_created_at_idx').on(t.createdAt)
	})
);

export const postMedia = pgTable(
	'post_media',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		mediaId: uuid('media_id')
			.notNull()
			.references(() => mediaItems.id, { onDelete: 'cascade' }),
		sortOrder: integer('sort_order').default(0).notNull()
	},
	(t) => ({
		postIdx: index('post_media_post_idx').on(t.postId)
	})
);

export const postTags = pgTable(
	'post_tags',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		tag: text('tag').notNull() // lowercase normalized without #
	},
	(t) => ({
		tagIdx: index('post_tags_tag_idx').on(t.tag),
		postIdx: index('post_tags_post_idx').on(t.postId)
	})
);

export const postMentions = pgTable('post_mentions', {
	id: uuid('id').defaultRandom().primaryKey(),
	postId: uuid('post_id')
		.notNull()
		.references(() => posts.id, { onDelete: 'cascade' }),
	commentId: uuid('comment_id'),
	mentionedUserId: uuid('mentioned_user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' })
});

export const reactions = pgTable(
	'reactions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		emoji: text('emoji').default('❤️').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniquePostUser: uniqueIndex('reactions_post_user_idx').on(t.postId, t.userId)
	})
);

export const comments = pgTable(
	'comments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		postId: uuid('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		authorId: uuid('author_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		parentCommentId: uuid('parent_comment_id'),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		postIdx: index('comments_post_idx').on(t.postId)
	})
);

// -----------------------------------------------------------------------------
// 4. Stories & Profile Highlights
// -----------------------------------------------------------------------------
export const stories = pgTable(
	'stories',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		authorId: uuid('author_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		mediaId: uuid('media_id')
			.notNull()
			.references(() => mediaItems.id, { onDelete: 'cascade' }),
		caption: text('caption').default('').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		expiresIdx: index('stories_expires_idx').on(t.expiresAt)
	})
);

export const storyViews = pgTable(
	'story_views',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		storyId: uuid('story_id')
			.notNull()
			.references(() => stories.id, { onDelete: 'cascade' }),
		viewerId: uuid('viewer_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniqueView: uniqueIndex('story_views_unique_idx').on(t.storyId, t.viewerId)
	})
);

export const highlights = pgTable('highlights', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	coverMediaId: uuid('cover_media_id').references(() => mediaItems.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const highlightItems = pgTable(
	'highlight_items',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		highlightId: uuid('highlight_id')
			.notNull()
			.references(() => highlights.id, { onDelete: 'cascade' }),
		storyId: uuid('story_id')
			.notNull()
			.references(() => stories.id, { onDelete: 'cascade' }),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniqueHighlightStory: uniqueIndex('highlight_story_unique_idx').on(t.highlightId, t.storyId)
	})
);

// -----------------------------------------------------------------------------
// 5. Shared Albums
// -----------------------------------------------------------------------------
export const albums = pgTable('albums', {
	id: uuid('id').defaultRandom().primaryKey(),
	ownerId: uuid('owner_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	description: text('description').default('').notNull(),
	coverMediaId: uuid('cover_media_id').references(() => mediaItems.id, { onDelete: 'set null' }),
	isShared: boolean('is_shared').default(true).notNull(),
	eventDate: timestamp('event_date', { withTimezone: true }).defaultNow().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const albumContributors = pgTable(
	'album_contributors',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		albumId: uuid('album_id')
			.notNull()
			.references(() => albums.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniqueContributor: uniqueIndex('album_contributor_unique_idx').on(t.albumId, t.userId)
	})
);

export const albumMedia = pgTable(
	'album_media',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		albumId: uuid('album_id')
			.notNull()
			.references(() => albums.id, { onDelete: 'cascade' }),
		mediaId: uuid('media_id')
			.notNull()
			.references(() => mediaItems.id, { onDelete: 'cascade' }),
		addedById: uuid('added_by_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		caption: text('caption').default('').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniqueAlbumMedia: uniqueIndex('album_media_unique_idx').on(t.albumId, t.mediaId)
	})
);

// -----------------------------------------------------------------------------
// 6. Direct & Group Messages
// -----------------------------------------------------------------------------
export const conversations = pgTable('conversations', {
	id: uuid('id').defaultRandom().primaryKey(),
	type: text('type').$type<'direct' | 'group'>().default('direct').notNull(),
	title: text('title').default('').notNull(),
	createdById: uuid('created_by_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow().notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const conversationMembers = pgTable(
	'conversation_members',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		lastReadMessageId: uuid('last_read_message_id'),
		lastReadAt: timestamp('last_read_at', { withTimezone: true }).defaultNow().notNull(),
		muted: boolean('muted').default(false).notNull(),
		joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		uniqueMember: uniqueIndex('conv_member_unique_idx').on(t.conversationId, t.userId)
	})
);

export const messages = pgTable(
	'messages',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		conversationId: uuid('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		senderId: uuid('sender_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		body: text('body').default('').notNull(),
		mediaId: uuid('media_id').references(() => mediaItems.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(t) => ({
		convIdx: index('messages_conv_idx').on(t.conversationId, t.createdAt)
	})
);

// -----------------------------------------------------------------------------
// 7. Notifications & Web Push
// -----------------------------------------------------------------------------
export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		recipientId: uuid('recipient_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		actorId: uuid('actor_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type')
			.$type<
				| 'like'
				| 'comment'
				| 'mention'
				| 'story'
				| 'message'
				| 'album'
				| 'child_contact_request'
			>()
			.notNull(),
		referenceId: text('reference_id').default('').notNull(),
		messageText: text('message_text').default('').notNull(),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		recipientIdx: index('notifications_recipient_idx').on(t.recipientId, t.createdAt)
	})
);

export const notificationPreferences = pgTable('notification_preferences', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	likes: boolean('likes').default(true).notNull(),
	comments: boolean('comments').default(true).notNull(),
	mentions: boolean('mentions').default(true).notNull(),
	stories: boolean('stories').default(true).notNull(),
	messages: boolean('messages').default(true).notNull(),
	webPushEnabled: boolean('web_push_enabled').default(true).notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const pushSubscriptions = pgTable('push_subscriptions', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	userAgent: text('user_agent').default('').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// -----------------------------------------------------------------------------
// 8. Admin Moderation Reports, Background Jobs & Backup Runs
// -----------------------------------------------------------------------------
export const reports = pgTable('reports', {
	id: uuid('id').defaultRandom().primaryKey(),
	reporterId: uuid('reporter_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	targetType: text('target_type').$type<'post' | 'comment' | 'message'>().notNull(),
	targetId: uuid('target_id').notNull(),
	reason: text('reason').notNull(),
	status: text('status').$type<'open' | 'resolved' | 'dismissed'>().default('open').notNull(),
	resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
	resolvedAt: timestamp('resolved_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const backgroundJobs = pgTable(
	'background_jobs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name')
			.$type<'process_media' | 'cleanup_expired' | 'run_backup'>()
			.notNull(),
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
		status: text('status')
			.$type<'queued' | 'running' | 'completed' | 'failed'>()
			.default('queued')
			.notNull(),
		attempts: integer('attempts').default(0).notNull(),
		maxAttempts: integer('max_attempts').default(3).notNull(),
		errorText: text('error_text'),
		scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow().notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => ({
		statusIdx: index('bg_jobs_status_idx').on(t.status, t.scheduledFor)
	})
);

export const backupRuns = pgTable('backup_runs', {
	id: uuid('id').defaultRandom().primaryKey(),
	status: text('status').$type<'running' | 'completed' | 'failed'>().notNull(),
	archiveName: text('archive_name').notNull(),
	sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0).notNull(),
	triggeredById: uuid('triggered_by_id').references(() => users.id, { onDelete: 'set null' }),
	notes: text('notes').default('').notNull(),
	startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
	completedAt: timestamp('completed_at', { withTimezone: true })
});
