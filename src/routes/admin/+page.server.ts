import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	users,
	invites,
	mediaItems,
	reports,
	backupRuns,
	childApprovedContacts
} from '$lib/server/db/schema.js';
import { desc, sql } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (locals.user.role !== 'admin') {
		throw error(403, 'Admin privileges required.');
	}
	await ensureSchema();

	const [allUsers, allInvites, allReports, allBackups, allChildLinks, storageAgg] =
		await Promise.all([
			db.select().from(users).orderBy(desc(users.createdAt)),
			db.select().from(invites).orderBy(desc(invites.createdAt)),
			db.select().from(reports).orderBy(desc(reports.createdAt)),
			db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(10),
			db.select().from(childApprovedContacts),
			db
				.select({
					totalBytes: sql<number>`COALESCE(SUM(${mediaItems.sizeBytes}), 0)`,
					mediaCount: sql<number>`COUNT(*)`
				})
				.from(mediaItems)
		]);

	const usedBytes = Number(storageAgg[0]?.totalBytes || 0);
	const quotaGb = Number(process.env.STORAGE_QUOTA_GB || 180);
	const quotaBytes = quotaGb * 1024 * 1024 * 1024;

	return {
		users: allUsers.map((u) => ({
			id: u.id,
			username: u.username,
			email: u.email,
			displayName: u.displayName,
			relationshipLabel: u.relationshipLabel,
			role: u.role,
			isActive: u.isActive,
			createdAt: u.createdAt.toISOString()
		})),
		invites: allInvites.map((inv) => ({
			id: inv.id,
			code: inv.code,
			assignedRole: inv.assignedRole,
			defaultRelationshipLabel: inv.defaultRelationshipLabel,
			note: inv.note,
			claimedById: inv.claimedById,
			expiresAt: inv.expiresAt.toISOString()
		})),
		reports: allReports.map((r) => ({
			id: r.id,
			targetType: r.targetType,
			targetId: r.targetId,
			reason: r.reason,
			status: r.status,
			createdAt: r.createdAt.toISOString()
		})),
		backups: allBackups.map((b) => ({
			id: b.id,
			status: b.status,
			archiveName: b.archiveName,
			sizeBytes: b.sizeBytes,
			startedAt: b.startedAt.toISOString()
		})),
		childLinks: allChildLinks,
		storage: {
			usedBytes,
			usedMb: Number((usedBytes / (1024 * 1024)).toFixed(2)),
			quotaGb,
			percentUsed: Math.min(100, Number(((usedBytes / quotaBytes) * 100).toFixed(2))),
			mediaCount: Number(storageAgg[0]?.mediaCount || 0)
		}
	};
};
