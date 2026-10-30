import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumePasswordResetToken } from '$lib/server/auth/index.js';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const token = String(body.token || '').trim();
	const newPassword = String(body.newPassword || '');

	if (!token || newPassword.length < 8) {
		return json(
			{ error: 'Valid reset token and a new password (min 8 characters) are required.' },
			{ status: 400 }
		);
	}

	const ok = await consumePasswordResetToken(token, newPassword);
	if (!ok) {
		return json({ error: 'Reset token is invalid or has expired.' }, { status: 400 });
	}

	return json({ ok: true });
};
