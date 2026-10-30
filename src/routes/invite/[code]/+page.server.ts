import type { PageServerLoad } from './$types';
import { validateInviteCode } from '$lib/server/auth/index.js';

export const load: PageServerLoad = async ({ params }) => {
	const invite = await validateInviteCode(params.code);
	return {
		code: params.code.toUpperCase(),
		invite: invite
			? {
					code: invite.code,
					assignedRole: invite.assignedRole,
					defaultRelationshipLabel: invite.defaultRelationshipLabel,
					note: invite.note,
					expiresAt: invite.expiresAt.toISOString()
				}
			: null
	};
};
