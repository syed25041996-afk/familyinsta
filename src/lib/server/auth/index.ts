import { hash, verify } from '@node-rs/argon2';
import crypto from 'node:crypto';
import { db, ensureSchema } from '../db/index.js';
import {
	users,
	sessions,
	invites,
	passwordResets,
	childApprovedContacts,
	notificationPreferences
} from '../db/schema.js';
import { eq, and, gt, isNull, or } from 'drizzle-orm';

export const SESSION_COOKIE_NAME = 'kinship_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// -----------------------------------------------------------------------------
// 1. Argon2id Password Hashing
// -----------------------------------------------------------------------------
export async function hashPassword(password: string): Promise<string> {
	return hash(password, {
		memoryCost: 19456,
		timeCost: 2,
		outputLen: 32,
		parallelism: 1
	});
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	try {
		return await verify(passwordHash, password);
	} catch {
		return false;
	}
}

// -----------------------------------------------------------------------------
// 2. Rate Limiting (Login & Sensitive Auth Endpoints)
// -----------------------------------------------------------------------------
interface RateBucket {
	count: number;
	resetAt: number;
}
const loginRateMap = new Map<string, RateBucket>();

export function checkRateLimit(
	key: string,
	maxAttempts = 6,
	windowMs = 15 * 60 * 1000
): { allowed: boolean; retryAfterSec: number } {
	const now = Date.now();
	const existing = loginRateMap.get(key);
	if (!existing || existing.resetAt <= now) {
		loginRateMap.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, retryAfterSec: 0 };
	}
	if (existing.count >= maxAttempts) {
		return {
			allowed: false,
			retryAfterSec: Math.ceil((existing.resetAt - now) / 1000)
		};
	}
	existing.count += 1;
	return { allowed: true, retryAfterSec: 0 };
}

export function clearRateLimit(key: string): void {
	loginRateMap.delete(key);
}

// -----------------------------------------------------------------------------
// 3. Session Management & CSRF Tokens
// -----------------------------------------------------------------------------
export function sha256Hex(input: string): string {
	return crypto.createHash('sha256').update(input).digest('hex');
}

export async function createSession(
	userId: string,
	ipAddress?: string,
	userAgent?: string
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
	await ensureSchema();
	const token = crypto.randomBytes(32).toString('base64url');
	const sessionId = sha256Hex(token);
	const csrfToken = crypto.randomBytes(24).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		csrfToken,
		ipAddress: ipAddress || null,
		userAgent: userAgent || null,
		expiresAt
	});

	return { token, csrfToken, expiresAt };
}

export async function validateSessionToken(token: string | undefined) {
	if (!token) return null;
	await ensureSchema();
	const sessionId = sha256Hex(token);
	const now = new Date();

	const rows = await db
		.select({
			session: sessions,
			user: users
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
		.limit(1);

	if (rows.length === 0) return null;
	const { session, user } = rows[0];
	if (!user.isActive) return null;

	return { session, user };
}

export async function invalidateSession(token: string | undefined): Promise<void> {
	if (!token) return;
	await ensureSchema();
	const sessionId = sha256Hex(token);
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// -----------------------------------------------------------------------------
// 4. Invite-Only Signup & Invite Codes
// -----------------------------------------------------------------------------
export function generateInviteCode(prefix = 'FAMILY'): string {
	const cleanPrefix = prefix
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 8) || 'FAMILY';
	const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
	return `${cleanPrefix}-${randomSuffix}`;
}

export async function validateInviteCode(code: string) {
	await ensureSchema();
	const normalized = code.trim().toUpperCase();
	const now = new Date();
	const rows = await db
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.code, normalized),
				isNull(invites.claimedById),
				gt(invites.expiresAt, now)
			)
		)
		.limit(1);
	return rows[0] || null;
}

export async function registerUserWithInvite(params: {
	inviteCode: string;
	email: string;
	username: string;
	password: string;
	displayName: string;
	relationshipLabel?: string;
}) {
	await ensureSchema();
	const invite = await validateInviteCode(params.inviteCode);
	if (!invite) {
		throw new Error('Invalid, expired, or already used invite code.');
	}

	const passwordHash = await hashPassword(params.password);
	const cleanUsername = params.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
	const cleanEmail = params.email.trim().toLowerCase();

	const [newUser] = await db
		.insert(users)
		.values({
			email: cleanEmail,
			username: cleanUsername,
			passwordHash,
			displayName: params.displayName.trim(),
			relationshipLabel:
				params.relationshipLabel?.trim() || invite.defaultRelationshipLabel || 'Family',
			role: invite.assignedRole
		})
		.returning();

	await db
		.update(invites)
		.set({
			claimedById: newUser.id,
			claimedAt: new Date()
		})
		.where(eq(invites.id, invite.id));

	await db
		.insert(notificationPreferences)
		.values({ userId: newUser.id })
		.onConflictDoNothing();

	// If child account, automatically approve the inviting admin as an approved contact
	if (newUser.role === 'child') {
		await db
			.insert(childApprovedContacts)
			.values({
				childUserId: newUser.id,
				contactUserId: invite.createdById,
				status: 'approved',
				approvedById: invite.createdById
			})
			.onConflictDoNothing();
	}

	return newUser;
}

// -----------------------------------------------------------------------------
// 5. Password Reset Tokens
// -----------------------------------------------------------------------------
export async function createPasswordResetToken(
	userId: string,
	createdByAdminId?: string
): Promise<string> {
	await ensureSchema();
	const rawToken = crypto.randomBytes(24).toString('base64url');
	const tokenHash = sha256Hex(rawToken);
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

	await db.insert(passwordResets).values({
		userId,
		tokenHash,
		createdByAdminId: createdByAdminId || null,
		expiresAt
	});

	return rawToken;
}

export async function consumePasswordResetToken(
	rawToken: string,
	newPassword: string
): Promise<boolean> {
	await ensureSchema();
	const tokenHash = sha256Hex(rawToken.trim());
	const now = new Date();

	const rows = await db
		.select()
		.from(passwordResets)
		.where(
			and(
				eq(passwordResets.tokenHash, tokenHash),
				isNull(passwordResets.usedAt),
				gt(passwordResets.expiresAt, now)
			)
		)
		.limit(1);

	if (rows.length === 0) return false;
	const reset = rows[0];
	const newHash = await hashPassword(newPassword);

	await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, reset.userId));
	await db
		.update(passwordResets)
		.set({ usedAt: now })
		.where(eq(passwordResets.id, reset.id));
	// Revoke all old sessions for security
	await db.delete(sessions).where(eq(sessions.userId, reset.userId));

	return true;
}

// -----------------------------------------------------------------------------
// 6. Child Account Safety & Visibility Enforcement
// -----------------------------------------------------------------------------
/**
 * Returns the set of user IDs that `viewer` is allowed to see posts/stories/profiles from
 * and interact with.
 * - For `admin` and `member`: returns null (meaning all active family members are visible,
 *   except if interacting with a `child` who hasn't approved them—handled in `canUsersInteract`).
 * - For `child`: returns strictly [viewer.id, ...all admin IDs, ...approved contact IDs].
 */
export async function getVisibleUserIdsForViewer(viewer: {
	id: string;
	role: 'admin' | 'member' | 'child';
}): Promise<string[] | null> {
	if (viewer.role !== 'child') {
		return null; // Full family visibility
	}
	await ensureSchema();

	const adminRows = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.role, 'admin'));

	const approvedRows = await db
		.select({ contactUserId: childApprovedContacts.contactUserId })
		.from(childApprovedContacts)
		.where(
			and(
				eq(childApprovedContacts.childUserId, viewer.id),
				eq(childApprovedContacts.status, 'approved')
			)
		);

	const allowed = new Set<string>([viewer.id]);
	for (const a of adminRows) allowed.add(a.id);
	for (const c of approvedRows) allowed.add(c.contactUserId);

	return Array.from(allowed);
}

export async function canUsersInteract(
	userA: { id: string; role: 'admin' | 'member' | 'child' },
	userB: { id: string; role: 'admin' | 'member' | 'child' }
): Promise<boolean> {
	if (userA.id === userB.id) return true;
	if (userA.role === 'admin' || userB.role === 'admin') return true;

	await ensureSchema();
	if (userA.role === 'child') {
		const allowed = await getVisibleUserIdsForViewer(userA);
		if (!allowed?.includes(userB.id)) return false;
	}
	if (userB.role === 'child') {
		const allowed = await getVisibleUserIdsForViewer(userB);
		if (!allowed?.includes(userA.id)) return false;
	}
	return true;
}
