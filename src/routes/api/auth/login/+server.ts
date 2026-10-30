import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { users } from '$lib/server/db/schema.js';
import { eq, or } from 'drizzle-orm';
import {
	SESSION_COOKIE_NAME,
	verifyPassword,
	createSession,
	checkRateLimit,
	clearRateLimit
} from '$lib/server/auth/index.js';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	await ensureSchema();
	const body = await request.json().catch(() => ({}));
	const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
	const password = String(body.password || '');

	if (!identifier || !password) {
		return json({ error: 'Please enter your email/username and password.' }, { status: 400 });
	}

	let clientIp = '127.0.0.1';
	try {
		clientIp = getClientAddress();
	} catch {
		clientIp = '127.0.0.1';
	}
	const rateKey = `login:${clientIp}:${identifier}`;
	const limit = checkRateLimit(rateKey, 6, 15 * 60 * 1000);
	if (!limit.allowed) {
		return json(
			{
				error: `Too many login attempts. Please wait ${limit.retryAfterSec} seconds.`
			},
			{ status: 429 }
		);
	}

	const rows = await db
		.select()
		.from(users)
		.where(or(eq(users.email, identifier), eq(users.username, identifier)))
		.limit(1);

	if (rows.length === 0) {
		return json({ error: 'Invalid login credentials.' }, { status: 401 });
	}

	const user = rows[0];
	if (!user.isActive) {
		return json(
			{ error: 'This family account has been deactivated by an administrator.' },
			{ status: 403 }
		);
	}

	const valid = await verifyPassword(user.passwordHash, password);
	if (!valid) {
		return json({ error: 'Invalid login credentials.' }, { status: 401 });
	}

	clearRateLimit(rateKey);
	const session = await createSession(
		user.id,
		clientIp,
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
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			role: user.role,
			relationshipLabel: user.relationshipLabel
		},
		csrfToken: session.csrfToken
	});
};
