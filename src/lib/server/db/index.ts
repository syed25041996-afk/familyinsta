import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema.js';

export type Database = ReturnType<typeof drizzlePg<typeof schema>>;

let dbInstance: Database | null = null;
let schemaInitialized = false;
let initPromise: Promise<void> | null = null;

export function getDb(): Database {
	if (dbInstance) return dbInstance;

	const dbUrl = process.env.DATABASE_URL || 'pglite://./data/pglite';
	if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
		const pool = new pg.Pool({
			connectionString: dbUrl,
			max: 15
		});
		dbInstance = drizzlePg(pool, { schema });
	} else {
		let dataDir = dbUrl.replace(/^pglite:\/\//, '');
		if (dataDir === 'memory://' || dataDir === ':memory:') {
			const client = new PGlite();
			dbInstance = drizzlePglite(client, { schema }) as unknown as Database;
		} else {
			const resolved = path.resolve(dataDir);
			fs.mkdirSync(path.dirname(resolved), { recursive: true });
			const client = new PGlite(resolved);
			dbInstance = drizzlePglite(client, { schema }) as unknown as Database;
		}
	}

	return dbInstance;
}

export const db = new Proxy({} as Database, {
	get(_target, prop) {
		const instance = getDb();
		const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});

/**
 * Ensures all PostgreSQL tables and indexes exist.
 * Safe to call multiple times (idempotent CREATE TABLE IF NOT EXISTS).
 */
export async function ensureSchema(): Promise<void> {
	if (schemaInitialized) return;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const database = getDb();
		const ddl = `
			CREATE TABLE IF NOT EXISTS users (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				email TEXT NOT NULL UNIQUE,
				username TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				display_name TEXT NOT NULL,
				relationship_label TEXT NOT NULL DEFAULT 'Family',
				bio TEXT NOT NULL DEFAULT '',
				role TEXT NOT NULL DEFAULT 'member',
				avatar_media_id UUID,
				locale TEXT NOT NULL DEFAULT 'en',
				text_scale TEXT NOT NULL DEFAULT 'normal',
				theme TEXT NOT NULL DEFAULT 'system',
				is_active BOOLEAN NOT NULL DEFAULT TRUE,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				csrf_token TEXT NOT NULL,
				ip_address TEXT,
				user_agent TEXT,
				expires_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS passkeys (
				id TEXT PRIMARY KEY,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				public_key TEXT NOT NULL,
				counter INTEGER NOT NULL DEFAULT 0,
				device_name TEXT NOT NULL DEFAULT 'Passkey Device',
				transports TEXT NOT NULL DEFAULT '[]',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS password_resets (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				token_hash TEXT NOT NULL UNIQUE,
				created_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				used_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS invites (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				code TEXT NOT NULL UNIQUE,
				assigned_role TEXT NOT NULL DEFAULT 'member',
				default_relationship_label TEXT NOT NULL DEFAULT 'Family',
				note TEXT NOT NULL DEFAULT '',
				created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				claimed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				claimed_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS child_approved_contacts (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				child_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				contact_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				status TEXT NOT NULL DEFAULT 'approved',
				approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(child_user_id, contact_user_id)
			);

			CREATE TABLE IF NOT EXISTS media_items (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				type TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'uploading',
				original_rel_path TEXT NOT NULL,
				display_webp_rel_path TEXT,
				display_avif_rel_path TEXT,
				thumb_rel_path TEXT,
				video_mp4_rel_path TEXT,
				video_hls_rel_path TEXT,
				width INTEGER NOT NULL DEFAULT 1080,
				height INTEGER NOT NULL DEFAULT 1080,
				duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
				size_bytes BIGINT NOT NULL DEFAULT 0,
				mime_type TEXT NOT NULL,
				sha256 TEXT NOT NULL DEFAULT '',
				alt_text TEXT NOT NULL DEFAULT '',
				keep_exif BOOLEAN NOT NULL DEFAULT FALSE,
				exif_data JSONB,
				taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS upload_sessions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				media_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
				uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				filename TEXT NOT NULL,
				mime_type TEXT NOT NULL,
				total_size_bytes BIGINT NOT NULL,
				total_chunks INTEGER NOT NULL,
				uploaded_chunks INTEGER NOT NULL DEFAULT 0,
				temp_dir_rel_path TEXT NOT NULL,
				keep_exif BOOLEAN NOT NULL DEFAULT FALSE,
				alt_text TEXT NOT NULL DEFAULT '',
				completed_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS posts (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				caption TEXT NOT NULL DEFAULT '',
				location_name TEXT NOT NULL DEFAULT '',
				keep_exif BOOLEAN NOT NULL DEFAULT FALSE,
				is_archived BOOLEAN NOT NULL DEFAULT FALSE,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS post_media (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
				media_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
				sort_order INTEGER NOT NULL DEFAULT 0
			);

			CREATE TABLE IF NOT EXISTS post_tags (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
				tag TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS post_mentions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
				comment_id UUID,
				mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
			);

			CREATE TABLE IF NOT EXISTS reactions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				emoji TEXT NOT NULL DEFAULT '❤️',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(post_id, user_id)
			);

			CREATE TABLE IF NOT EXISTS comments (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
				author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				parent_comment_id UUID,
				body TEXT NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS stories (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				media_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
				caption TEXT NOT NULL DEFAULT '',
				expires_at TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS story_views (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
				viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(story_id, viewer_id)
			);

			CREATE TABLE IF NOT EXISTS highlights (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				cover_media_id UUID REFERENCES media_items(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS highlight_items (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				highlight_id UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
				story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
				sort_order INTEGER NOT NULL DEFAULT 0,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(highlight_id, story_id)
			);

			CREATE TABLE IF NOT EXISTS albums (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title TEXT NOT NULL,
				description TEXT NOT NULL DEFAULT '',
				cover_media_id UUID REFERENCES media_items(id) ON DELETE SET NULL,
				is_shared BOOLEAN NOT NULL DEFAULT TRUE,
				event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS album_contributors (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(album_id, user_id)
			);

			CREATE TABLE IF NOT EXISTS album_media (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
				media_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
				added_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				caption TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(album_id, media_id)
			);

			CREATE TABLE IF NOT EXISTS conversations (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				type TEXT NOT NULL DEFAULT 'direct',
				title TEXT NOT NULL DEFAULT '',
				created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS conversation_members (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				last_read_message_id UUID,
				last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				muted BOOLEAN NOT NULL DEFAULT FALSE,
				joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				UNIQUE(conversation_id, user_id)
			);

			CREATE TABLE IF NOT EXISTS messages (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
				sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				body TEXT NOT NULL DEFAULT '',
				media_id UUID REFERENCES media_items(id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				deleted_at TIMESTAMPTZ
			);

			CREATE TABLE IF NOT EXISTS notifications (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				type TEXT NOT NULL,
				reference_id TEXT NOT NULL DEFAULT '',
				message_text TEXT NOT NULL DEFAULT '',
				read_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS notification_preferences (
				user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				likes BOOLEAN NOT NULL DEFAULT TRUE,
				comments BOOLEAN NOT NULL DEFAULT TRUE,
				mentions BOOLEAN NOT NULL DEFAULT TRUE,
				stories BOOLEAN NOT NULL DEFAULT TRUE,
				messages BOOLEAN NOT NULL DEFAULT TRUE,
				web_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS push_subscriptions (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				endpoint TEXT NOT NULL UNIQUE,
				p256dh TEXT NOT NULL,
				auth TEXT NOT NULL,
				user_agent TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS reports (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				target_type TEXT NOT NULL,
				target_id UUID NOT NULL,
				reason TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'open',
				resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
				resolved_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS background_jobs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name TEXT NOT NULL,
				payload JSONB NOT NULL,
				status TEXT NOT NULL DEFAULT 'queued',
				attempts INTEGER NOT NULL DEFAULT 0,
				max_attempts INTEGER NOT NULL DEFAULT 3,
				error_text TEXT,
				scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				completed_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS backup_runs (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				status TEXT NOT NULL,
				archive_name TEXT NOT NULL,
				size_bytes BIGINT NOT NULL DEFAULT 0,
				triggered_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
				notes TEXT NOT NULL DEFAULT '',
				started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				completed_at TIMESTAMPTZ
			);
		`;
		const statements = ddl
			.split(';')
			.map((s) => s.trim())
			.filter(Boolean);
		for (const stmt of statements) {
			await database.execute(sql.raw(stmt));
		}
		schemaInitialized = true;
	})();

	return initPromise;
}
