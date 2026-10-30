import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	SESSION_COOKIE_NAME,
	registerUserWithInvite,
	createSession
} from '$lib/server/auth/index.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const inviteCode = String(body.inviteCode || '').trim();
	const email = String(body.email || '').trim();
	const username = String(body.username || '').trim();
	const password = String(body.password || '');
	const displayName = String(body.displayName || '').trim();
	const relationshipLabel = String(body.relationshipLabel || '').trim();

	if (!inviteCode || !email || !username || !displayName || password.length < 8) {
		return json(
			{
				error: 'Invite code, email, username, display name, and a password (min 8 characters) are required.'
			},
			{ status: 400 }
		);
	}

	try {
		const newUser = await registerUserWithInvite({
			inviteCode,
			email,
			username,
			password,
			displayName,
			relationshipLabel
		});

		const session = await createSession(
			newUser.id,
			undefined,
			request.headers.get('user-agent') || undefined
		);

		cookies.set(SESSION_COOKIE_NAME, session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			expires: session.expiresAt
		});

		return json({
			user: {
				id: newUser.id,
				username: newUser.username,
				displayName: newUser.displayName,
				role: newUser.role
			}
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Could not complete signup.' },
			{ status: 400 }
		);
	}
};
