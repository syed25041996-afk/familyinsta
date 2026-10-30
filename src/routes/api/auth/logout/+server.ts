import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME, invalidateSession } from '$lib/server/auth/index.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const authHeader = request.headers.get('authorization') || '';
	const bearerToken = authHeader.startsWith('Bearer ')
		? authHeader.slice(7).trim()
		: undefined;
	const token = bearerToken || cookies.get(SESSION_COOKIE_NAME);
	await invalidateSession(token);
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	return json({ ok: true });
};
