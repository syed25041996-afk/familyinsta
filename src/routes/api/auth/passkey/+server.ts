import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createWebAuthnChallenge,
	consumeWebAuthnChallenge,
	registerPasskeyCredential,
	findUserByPasskeyCredentialId,
	listUserPasskeys
} from '$lib/server/auth/passkey.js';
import { SESSION_COOKIE_NAME, createSession } from '$lib/server/auth/index.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	const mode = url.searchParams.get('mode') || 'login';
	if (mode === 'register') {
		if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
		const challenge = createWebAuthnChallenge(`reg:${locals.user.id}`);
		const existing = await listUserPasskeys(locals.user.id);
		return json({
			challenge,
			rp: {
				name: process.env.RP_NAME || 'Kinship Family Vault',
				id: process.env.RP_ID || 'localhost'
			},
			user: {
				id: locals.user.id,
				name: locals.user.username,
				displayName: locals.user.displayName
			},
			existingPasskeys: existing.map((p) => ({
				id: p.id,
				deviceName: p.deviceName,
				createdAt: p.createdAt
			}))
		});
	}

	const challenge = createWebAuthnChallenge('login:global');
	return json({
		challenge,
		rpId: process.env.RP_ID || 'localhost'
	});
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const body = await request.json().catch(() => ({}));
	const action = String(body.action || '');

	if (action === 'register') {
		if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
		const challenge = consumeWebAuthnChallenge(`reg:${locals.user.id}`);
		if (!challenge) {
			return json({ error: 'Passkey challenge expired. Please try again.' }, { status: 400 });
		}
		const credentialId = String(body.credentialId || '');
		const publicKey = String(body.publicKey || '');
		const deviceName = String(body.deviceName || 'Phone / Biometric Passkey');
		if (!credentialId || !publicKey) {
			return json({ error: 'Missing passkey credential payload.' }, { status: 400 });
		}
		const saved = await registerPasskeyCredential({
			userId: locals.user.id,
			credentialId,
			publicKey,
			deviceName
		});
		return json({ passkey: saved });
	}

	if (action === 'login') {
		const credentialId = String(body.credentialId || '');
		if (!credentialId) {
			return json({ error: 'Credential ID required' }, { status: 400 });
		}
		const found = await findUserByPasskeyCredentialId(credentialId);
		if (!found || !found.user.isActive) {
			return json({ error: 'Passkey not recognized.' }, { status: 401 });
		}
		const session = await createSession(
			found.user.id,
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
		return json({ user: found.user });
	}

	return json({ error: 'Invalid passkey action' }, { status: 400 });
};
