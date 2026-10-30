import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { users, invites } from '$lib/server/db/schema.js';
import { eq, isNull } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	await ensureSchema();

	const allUsers = await db
		.select({
			username: users.username,
			displayName: users.displayName,
			relationshipLabel: users.relationshipLabel,
			role: users.role
		})
		.from(users)
		.where(eq(users.isActive, true))
		.limit(8);

	const openInvites = await db
		.select({
			code: invites.code,
			assignedRole: invites.assignedRole,
			defaultRelationshipLabel: invites.defaultRelationshipLabel
		})
		.from(invites)
		.where(isNull(invites.claimedById))
		.limit(3);

	return {
		familyAccounts: allUsers,
		openInvites
	};
};
