import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/auth/index.js';
import { ensureSchema } from '$lib/server/db/index.js';

export const handle: Handle = async ({ event, resolve }) => {
	await ensureSchema();

	const token = event.cookies.get(SESSION_COOKIE_NAME);
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

	// Privacy & Security Headers: No indexing, no third-party framing, strict CSP
	response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()'
	);

	return response;
};
