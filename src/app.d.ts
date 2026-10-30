// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				email: string;
				username: string;
				displayName: string;
				relationshipLabel: string;
				bio: string;
				role: 'admin' | 'member' | 'child';
				avatarMediaId: string | null;
				locale: 'en' | 'hi' | 'kn' | 'ta';
				textScale: 'normal' | 'large' | 'xlarge';
				theme: 'system' | 'light' | 'dark';
				isActive: boolean;
			} | null;
			session: {
				id: string;
				csrfToken: string;
				expiresAt: Date;
			} | null;
		}
	}
}

export {};
