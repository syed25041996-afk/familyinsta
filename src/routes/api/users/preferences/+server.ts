import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { users, childApprovedContacts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { createNotification } from '$lib/server/push/index.js';

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await ensureSchema();

	const body = await request.json().catch(() => ({}));

	// Child requesting admin approval to connect with a family member
	if (body.action === 'request_child_contact') {
		const targetUserId = String(body.targetUserId || '');
		if (!targetUserId) return json({ error: 'Target user ID required' }, { status: 400 });

		await db
			.insert(childApprovedContacts)
			.values({
				childUserId: locals.user.id,
				contactUserId: targetUserId,
				status: 'pending'
			})
			.onConflictDoNothing();

		const admins = await db.select().from(users).where(eq(users.role, 'admin'));
		for (const admin of admins) {
			await createNotification({
				recipientId: admin.id,
				actorId: locals.user.id,
				type: 'child_contact_request',
				referenceId: targetUserId,
				messageText: `${locals.user.displayName} requested approval to connect with a family member`,
				url: '/admin'
			});
		}

		return json({ requested: true });
	}

	const displayName =
		body.displayName !== undefined ? String(body.displayName).trim() : locals.user.displayName;
	const relationshipLabel =
		body.relationshipLabel !== undefined
			? String(body.relationshipLabel).trim()
			: locals.user.relationshipLabel;
	const bio = body.bio !== undefined ? String(body.bio).trim() : locals.user.bio;
	const avatarMediaId =
		body.avatarMediaId !== undefined ? body.avatarMediaId : locals.user.avatarMediaId;
	const locale = (body.locale || locals.user.locale) as 'en' | 'hi' | 'kn' | 'ta';
	const textScale = (body.textScale || locals.user.textScale) as
		| 'normal'
		| 'large'
		| 'xlarge';
	const theme = (body.theme || locals.user.theme) as 'system' | 'light' | 'dark';

	const [updated] = await db
		.update(users)
		.set({
			displayName: displayName || locals.user.displayName,
			relationshipLabel: relationshipLabel || 'Family',
			bio,
			avatarMediaId,
			locale,
			textScale,
			theme
		})
		.where(eq(users.id, locals.user.id))
		.returning();

	return json({
		user: {
			id: updated.id,
			username: updated.username,
			displayName: updated.displayName,
			relationshipLabel: updated.relationshipLabel,
			bio: updated.bio,
			locale: updated.locale,
			textScale: updated.textScale,
			theme: updated.theme
		}
	});
};
