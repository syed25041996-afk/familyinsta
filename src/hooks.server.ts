import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/auth/index.js';
import { ensureSchema } from '$lib/server/db/index.js';

export const handle: Handle = async ({ event, resolve }) => {
	// Handle CORS preflight requests from Android / iOS mobile clients
	if (event.request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
				'Access-Control-Max-Age': '86400'
			}
		});
	}

	await ensureSchema();

	// Support both Mobile Bearer Token (Authorization: Bearer <token>) and Cookie fallback
	const authHeader = event.request.headers.get('authorization') || '';
	const bearerToken = authHeader.startsWith('Bearer ')
		? authHeader.slice(7).trim()
		: undefined;
	const token =
		bearerToken ||
		event.url.searchParams.get('session_token') ||
		event.cookies.get(SESSION_COOKIE_NAME);

	const validated = await validateSessionToken(token);

	if (validated) {
		event.locals.user = {
			id: validated.user.id,
			email: validated.user.email,
			username: validated.user.username,
			displayName: validated.user.displayName,
			relationshipLabel: validated.user.relationshipLabel,
			bio: validated.user.bio,
			role: validated.user.role,
			avatarMediaId: validated.user.avatarMediaId,
			locale: validated.user.locale,
			textScale: validated.user.textScale,
			theme: validated.user.theme,
			isActive: validated.user.isActive
		};
		event.locals.session = {
			id: validated.session.id,
			csrfToken: validated.session.csrfToken,
			expiresAt: validated.session.expiresAt
		};
	} else {
		event.locals.user = null;
		event.locals.session = null;
	}

	const response = await resolve(event);

	// Mobile API CORS + Privacy Headers (No indexing, no third-party trackers)
	response.headers.set('Access-Control-Allow-Origin', '*');
	response.headers.set(
		'Access-Control-Allow-Headers',
		'Content-Type, Authorization, X-CSRF-Token'
	);
	response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
	response.headers.set('X-Content-Type-Options', 'nosniff');

	return response;
};
