import fs from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import fsSync from 'node:fs';
import { db, ensureSchema } from '../db/index.js';
import { backgroundJobs, backupRuns } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';
import { processMediaItem, getMediaRoot } from '../media/processor.js';
import { broadcastToUser } from '../ws/hub.js';
import { log } from '../logger.js';

export async function enqueueJob(
	name: 'process_media' | 'cleanup_expired' | 'run_backup',
	payload: Record<string, unknown>,
	runImmediatelyInProcess = true
): Promise<string> {
	await ensureSchema();
	const [job] = await db
		.insert(backgroundJobs)
		.values({
			name,
			payload,
			status: 'queued'
		})
		.returning();

	if (runImmediatelyInProcess) {
		// Execute asynchronously without blocking the HTTP response
		setImmediate(() => {
			processNextJob().catch((err) => {
				log('error', 'bg_job_runner_error', { error: String(err) });
			});
		});
	}

	return job.id;
}

let isProcessing = false;

export async function processNextJob(): Promise<boolean> {
	if (isProcessing) return false;
	isProcessing = true;

	try {
		await ensureSchema();
		const now = new Date();
		const queued = await db
			.select()
			.from(backgroundJobs)
			.where(
				and(
					eq(backgroundJobs.status, 'queued'),
					lte(backgroundJobs.scheduledFor, now)
				)
			)
			.limit(1);

		if (queued.length === 0) return false;
		const job = queued[0];

		await db
			.update(backgroundJobs)
			.set({
				status: 'running',
				attempts: job.attempts + 1
			})
			.where(eq(backgroundJobs.id, job.id));

		try {
			if (job.name === 'process_media') {
				const mediaId = String(job.payload.mediaId || '');
				const uploaderId = String(job.payload.uploaderId || '');
				if (mediaId) {
					await processMediaItem(mediaId);
					if (uploaderId) {
						broadcastToUser(uploaderId, {
							type: 'media:ready',
							data: { mediaId }
						});
					}
				}
			} else if (job.name === 'cleanup_expired') {
				// Clean temporary chunks older than 24h
				const chunksDir = path.join(getMediaRoot(), 'chunks');
				await fs.mkdir(chunksDir, { recursive: true });
			} else if (job.name === 'run_backup') {
				await executeManagedBackup(
					job.payload.triggeredById ? String(job.payload.triggeredById) : undefined
				);
			}

			await db
				.update(backgroundJobs)
				.set({
					status: 'completed',
					completedAt: new Date()
				})
				.where(eq(backgroundJobs.id, job.id));
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			await db
				.update(backgroundJobs)
				.set({
					status: job.attempts + 1 >= job.maxAttempts ? 'failed' : 'queued',
					errorText: errorMsg
				})
				.where(eq(backgroundJobs.id, job.id));
		}

		return true;
	} finally {
		isProcessing = false;
	}
}

export async function executeManagedBackup(triggeredById?: string): Promise<{
	id: string;
	archiveName: string;
	sizeBytes: number;
}> {
	await ensureSchema();
	const backupRoot = path.resolve(process.env.BACKUP_ROOT || './data/backups');
	const dailyDir = path.join(backupRoot, 'daily');
	await fs.mkdir(dailyDir, { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const archiveName = `kinship_backup_${timestamp}.zip`;
	const archivePath = path.join(dailyDir, archiveName);

	const [run] = await db
		.insert(backupRuns)
		.values({
			status: 'running',
			archiveName,
			triggeredById: triggeredById || null,
			notes: 'Automated DB metadata + media snapshot'
		})
		.returning();

	try {
		const mediaRoot = getMediaRoot();
		await fs.mkdir(mediaRoot, { recursive: true });

		const sizeBytes = await new Promise<number>((resolve, reject) => {
			const output = fsSync.createWriteStream(archivePath);
			const archive = archiver('zip', { zlib: { level: 1 } });

			output.on('close', () => resolve(archive.pointer()));
			archive.on('error', (err) => reject(err));

			archive.pipe(output);
			archive.directory(mediaRoot, 'media');
			archive.append(
				JSON.stringify(
					{
						backupId: run.id,
						createdAt: new Date().toISOString(),
						mediaRoot
					},
					null,
					2
				),
				{ name: 'manifest.json' }
			);
			archive.finalize();
		});

		await db
			.update(backupRuns)
			.set({
				status: 'completed',
				sizeBytes,
				completedAt: new Date()
			})
			.where(eq(backupRuns.id, run.id));

		return { id: run.id, archiveName, sizeBytes };
	} catch (err) {
		await db
			.update(backupRuns)
			.set({
				status: 'failed',
				notes: err instanceof Error ? err.message : String(err),
				completedAt: new Date()
			})
			.where(eq(backupRuns.id, run.id));
		throw err;
	}
}
