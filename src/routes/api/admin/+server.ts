import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import {
	users,
	invites,
	reports,
	posts,
	comments,
	messages,
	childApprovedContacts
} from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
	generateInviteCode,
	createPasswordResetToken
} from '$lib/server/auth/index.js';
import { executeManagedBackup } from '$lib/server/queue/index.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		return json({ error: 'Admin access required.' }, { status: 403 });
	}
	await ensureSchema();

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || '');

	// 1. Create a One-Time Family Invite Code/Link
	if (action === 'create_invite') {
		const assignedRole = (body.assignedRole || 'member') as 'admin' | 'member' | 'child';
		const defaultRelationshipLabel = String(
			body.defaultRelationshipLabel || 'Family'
		).trim();
		const note = String(body.note || '').trim();
		const expiresInDays = Math.max(1, Number(body.expiresInDays || 7));

		const code = generateInviteCode(defaultRelationshipLabel || 'FAMILY');
		const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

		const [invite] = await db
			.insert(invites)
			.values({
				code,
				assignedRole,
				defaultRelationshipLabel,
				note,
				createdById: locals.user.id,
				expiresAt
			})
			.returning();

		return json({ invite });
	}

	// 2. Revoke an Invite
	if (action === 'revoke_invite') {
		const inviteId = String(body.inviteId || '');
		await db.delete(invites).where(eq(invites.id, inviteId));
		return json({ deleted: true });
	}

	// 3. Update User Role or Active Status
	if (action === 'update_user') {
		const userId = String(body.userId || '');
		const role = body.role as 'admin' | 'member' | 'child' | undefined;
		const isActive = body.isActive as boolean | undefined;
		const relationshipLabel = body.relationshipLabel as string | undefined;

		if (!userId) return json({ error: 'User ID required' }, { status: 400 });

		const updateFields: Partial<typeof users.$inferInsert> = {};
		if (role) updateFields.role = role;
		if (typeof isActive === 'boolean') updateFields.isActive = isActive;
		if (relationshipLabel !== undefined) updateFields.relationshipLabel = relationshipLabel;

		const [updated] = await db
			.update(users)
			.set(updateFields)
			.where(eq(users.id, userId))
			.returning();

		return json({ user: updated });
	}

	// 4. Generate Admin Password Reset Token for a Relative
	if (action === 'create_reset_token') {
		const userId = String(body.userId || '');
		if (!userId) return json({ error: 'User ID required' }, { status: 400 });

		const token = await createPasswordResetToken(userId, locals.user.id);
		return json({
			token,
			resetUrl: `/reset-password?token=${encodeURIComponent(token)}`
		});
	}

	// 5. Approve or Remove a Contact for a Child Account
	if (action === 'approve_child_contact') {
		const childUserId = String(body.childUserId || '');
		const contactUserId = String(body.contactUserId || '');
		if (!childUserId || !contactUserId) {
			return json({ error: 'Both childUserId and contactUserId are required' }, { status: 400 });
		}

		await db
			.insert(childApprovedContacts)
			.values({
				childUserId,
				contactUserId,
				status: 'approved',
				approvedById: locals.user.id
			})
			.onConflictDoUpdate({
				target: [childApprovedContacts.childUserId, childApprovedContacts.contactUserId],
				set: {
					status: 'approved',
					approvedById: locals.user.id
				}
			});

		return json({ approved: true });
	}

	if (action === 'remove_child_contact') {
		const childUserId = String(body.childUserId || '');
		const contactUserId = String(body.contactUserId || '');
		await db
			.delete(childApprovedContacts)
			.where(
				and(
					eq(childApprovedContacts.childUserId, childUserId),
					eq(childApprovedContacts.contactUserId, contactUserId)
				)
			);
		return json({ removed: true });
	}

	// 6. Moderate Reported Content
	if (action === 'resolve_report') {
		const reportId = String(body.reportId || '');
		const decision = (body.decision || 'dismissed') as 'resolved' | 'dismissed';
		const deleteContent = Boolean(body.deleteContent);

		const [rep] = await db
			.select()
			.from(reports)
			.where(eq(reports.id, reportId))
			.limit(1);

		if (!rep) return json({ error: 'Report not found' }, { status: 404 });

		if (deleteContent) {
			if (rep.targetType === 'post') {
				await db.delete(posts).where(eq(posts.id, rep.targetId));
			} else if (rep.targetType === 'comment') {
				await db.delete(comments).where(eq(comments.id, rep.targetId));
			} else if (rep.targetType === 'message') {
				await db.delete(messages).where(eq(messages.id, rep.targetId));
			}
		}

		await db
			.update(reports)
			.set({
				status: decision,
				resolvedById: locals.user.id,
				resolvedAt: new Date()
			})
			.where(eq(reports.id, reportId));

		return json({ resolved: true });
	}

	// 7. Trigger Manual Backup Now
	if (action === 'trigger_backup') {
		const result = await executeManagedBackup(locals.user.id);
		return json({ backup: result });
	}

	return json({ error: 'Unknown admin action' }, { status: 400 });
};
