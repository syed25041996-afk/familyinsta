import React, { createContext, useContext, useState, useEffect } from 'react';
import {
	initApiClient,
	apiFetch,
	setSessionToken,
	setServerUrl as saveServerUrl,
	DEFAULT_HOMELAB_URL
} from '../api/client';
import type { LocaleCode } from '../i18n/strings';

export interface MobileUser {
	id: string;
	username: string;
	email: string;
	displayName: string;
	relationshipLabel: string;
	bio: string;
	role: 'admin' | 'member' | 'child';
	avatarUrl: string | null;
	locale: LocaleCode;
	textScale: 'normal' | 'large' | 'xlarge';
	theme: 'system' | 'light' | 'dark';
}

interface AuthContextValue {
	user: MobileUser | null;
	loading: boolean;
	serverUrl: string;
	themeMode: 'light' | 'dark';
	locale: LocaleCode;
	fontScale: number;
	textScaleKey: 'normal' | 'large' | 'xlarge';
	colors: {
		bg: string;
		card: string;
		text: string;
		subtext: string;
		border: string;
		brand: string;
		brandSoft: string;
	};
	updateServerUrl: (url: string) => Promise<void>;
	loginWithToken: (token: string, user: MobileUser) => Promise<void>;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	cycleTextScale: () => Promise<void>;
	toggleTheme: () => Promise<void>;
	changeLocale: (loc: LocaleCode) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<MobileUser | null>(null);
	const [loading, setLoading] = useState(true);
	const [serverUrl, setServerUrlState] = useState(DEFAULT_HOMELAB_URL);
	const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');
	const [locale, setLocale] = useState<LocaleCode>('en');
	const [textScaleKey, setTextScaleKey] = useState<'normal' | 'large' | 'xlarge'>('normal');

	useEffect(() => {
		(async () => {
			const { serverUrl: savedUrl, token } = await initApiClient();
			setServerUrlState(savedUrl);
			if (token) {
				await refreshUser();
			}
			setLoading(false);
		})();
	}, []);

	async function refreshUser() {
		try {
			const res = await apiFetch('/api/mobile/bootstrap');
			if (res.authenticated && res.user) {
				setUser(res.user);
				setLocale(res.user.locale || 'en');
				setTextScaleKey(res.user.textScale || 'normal');
				if (res.user.theme === 'light' || res.user.theme === 'dark') {
					setThemeMode(res.user.theme);
				}
			} else {
				setUser(null);
			}
		} catch {
			// Server unreachable or token expired
		}
	}

	async function updateServerUrl(url: string) {
		await saveServerUrl(url);
		setServerUrlState(url.trim().replace(/\/+$/, ''));
	}

	async function loginWithToken(token: string, loggedInUser: MobileUser) {
		await setSessionToken(token);
		setUser(loggedInUser);
		setLocale(loggedInUser.locale || 'en');
		setTextScaleKey(loggedInUser.textScale || 'normal');
	}

	async function logout() {
		try {
			await apiFetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// ignore
		}
		await setSessionToken(null);
		setUser(null);
	}

	async function cycleTextScale() {
		const order: Array<'normal' | 'large' | 'xlarge'> = ['normal', 'large', 'xlarge'];
		const next = order[(order.indexOf(textScaleKey) + 1) % order.length];
		setTextScaleKey(next);
		if (user) {
			await apiFetch('/api/users/preferences', {
				method: 'PATCH',
				body: JSON.stringify({ textScale: next })
			}).catch(() => {});
		}
	}

	async function toggleTheme() {
		const next = themeMode === 'dark' ? 'light' : 'dark';
		setThemeMode(next);
		if (user) {
			await apiFetch('/api/users/preferences', {
				method: 'PATCH',
				body: JSON.stringify({ theme: next })
			}).catch(() => {});
		}
	}

	async function changeLocale(loc: LocaleCode) {
		setLocale(loc);
		if (user) {
			await apiFetch('/api/users/preferences', {
				method: 'PATCH',
				body: JSON.stringify({ locale: loc })
			}).catch(() => {});
		}
	}

	const fontScale = textScaleKey === 'xlarge' ? 1.32 : textScaleKey === 'large' ? 1.15 : 1.0;

	const colors =
		themeMode === 'dark'
			? {
					bg: '#0c0a09',
					card: '#1c1917',
					text: '#f5f5f4',
					subtext: '#a8a29e',
					border: '#292524',
					brand: '#dc5b4d',
					brandSoft: '#3b1814'
				}
			: {
					bg: '#fafaf9',
					card: '#ffffff',
					text: '#1c1917',
					subtext: '#78716c',
					border: '#e7e5e4',
					brand: '#c84031',
					brandSoft: '#fbe6e4'
				};

	return (
		<AuthContext.Provider
			value={{
				user,
				loading,
				serverUrl,
				themeMode,
				locale,
				fontScale,
				textScaleKey,
				colors,
				updateServerUrl,
				loginWithToken,
				logout,
				refreshUser,
				cycleTextScale,
				toggleTheme,
				changeLocale
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
	return ctx;
}
