import crypto from 'node:crypto';
import { db, ensureSchema } from '../db/index.js';
import { passkeys, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

export function createWebAuthnChallenge(key: string): string {
	const challenge = crypto.randomBytes(32).toString('base64url');
	challengeStore.set(key, {
		challenge,
		expiresAt: Date.now() + 5 * 60 * 1000
	});
	return challenge;
}

export function consumeWebAuthnChallenge(key: string): string | null {
	const entry = challengeStore.get(key);
	challengeStore.delete(key);
	if (!entry || entry.expiresAt < Date.now()) return null;
	return entry.challenge;
}

export async function listUserPasskeys(userId: string) {
	await ensureSchema();
	return db.select().from(passkeys).where(eq(passkeys.userId, userId));
}

export async function registerPasskeyCredential(params: {
	userId: string;
	credentialId: string;
	publicKey: string;
	deviceName?: string;
	transports?: string[];
}) {
	await ensureSchema();
	const [created] = await db
		.insert(passkeys)
		.values({
			id: params.credentialId,
			userId: params.userId,
			publicKey: params.publicKey,
			deviceName: params.deviceName || 'Family Passkey',
			transports: JSON.stringify(params.transports || ['internal'])
		})
		.onConflictDoUpdate({
			target: passkeys.id,
			set: {
				publicKey: params.publicKey,
				deviceName: params.deviceName || 'Family Passkey'
			}
		})
		.returning();
	return created;
}

export async function findUserByPasskeyCredentialId(credentialId: string) {
	await ensureSchema();
	const rows = await db
		.select({
			passkey: passkeys,
			user: users
		})
		.from(passkeys)
		.innerJoin(users, eq(passkeys.userId, users.id))
		.where(eq(passkeys.id, credentialId))
		.limit(1);
	return rows[0] || null;
}
