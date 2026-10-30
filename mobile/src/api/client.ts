import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

const SERVER_URL_KEY = 'kinship_server_url';
const SESSION_TOKEN_KEY = 'kinship_session_token';

// Default to your Proxmox VM IP on the home network (port 3080)
export const DEFAULT_HOMELAB_URL = 'http://192.168.1.103:3080';

let cachedServerUrl = DEFAULT_HOMELAB_URL;
let cachedToken: string | null = null;

export async function initApiClient(): Promise<{ serverUrl: string; token: string | null }> {
	try {
		const savedUrl = await SecureStore.getItemAsync(SERVER_URL_KEY);
		if (savedUrl) cachedServerUrl = savedUrl.replace(/\/+$/, '');
		const savedToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
		if (savedToken) cachedToken = savedToken;
	} catch {
		// Fallback for web/simulator
	}
	return { serverUrl: cachedServerUrl, token: cachedToken };
}

export function getServerUrl(): string {
	return cachedServerUrl;
}

export async function setServerUrl(url: string): Promise<void> {
	cachedServerUrl = url.trim().replace(/\/+$/, '');
	try {
		await SecureStore.setItemAsync(SERVER_URL_KEY, cachedServerUrl);
	} catch {
		// ignore
	}
}

export function getSessionToken(): string | null {
	return cachedToken;
}

export async function setSessionToken(token: string | null): Promise<void> {
	cachedToken = token;
	try {
		if (token) {
			await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
		} else {
			await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
		}
	} catch {
		// ignore
	}
}

/**
 * Resolves a signed relative media path (/api/media/...) to a full Home Lab URL.
 */
export function resolveMediaUrl(relOrAbs: string | null | undefined): string | null {
	if (!relOrAbs) return null;
	if (relOrAbs.startsWith('http://') || relOrAbs.startsWith('https://')) return relOrAbs;
	return `${cachedServerUrl}${relOrAbs.startsWith('/') ? '' : '/'}${relOrAbs}`;
}

export async function apiFetch<T = any>(
	path: string,
	options: RequestInit = {}
): Promise<T> {
	const url = `${cachedServerUrl}${path.startsWith('/') ? '' : '/'}${path}`;
	const headers: Record<string, string> = {
		...(options.headers as Record<string, string> | undefined)
	};
	if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
		headers['Content-Type'] = 'application/json';
	}
	if (cachedToken) {
		headers['Authorization'] = `Bearer ${cachedToken}`;
	}

	const res = await fetch(url, {
		...options,
		headers
	});

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.error || `Request failed (${res.status})`);
	}
	return data as T;
}

/**
 * Uploads a photo or video from the phone's camera/gallery to the Home Lab Server
 * with progress tracking.
 */
export async function uploadMobileMedia(params: {
	uri: string;
	filename: string;
	mimeType: string;
	altText?: string;
	keepExif?: boolean;
	onProgress?: (pct: number) => void;
}): Promise<{
	id: string;
	type: 'image' | 'video';
	thumbUrl: string;
	displayUrl: string;
	originalUrl: string;
	altText: string;
}> {
	const uploadUrl = `${cachedServerUrl}/api/media/upload`;

	const uploadTask = FileSystem.createUploadTask(
		uploadUrl,
		params.uri,
		{
			httpMethod: 'POST',
			uploadType: FileSystem.FileSystemUploadType.MULTIPART,
			fieldName: 'file',
			mimeType: params.mimeType,
			parameters: {
				altText: params.altText || params.filename,
				keepExif: params.keepExif ? 'true' : 'false'
			},
			headers: cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}
		},
		(progressData) => {
			if (params.onProgress && progressData.totalBytesExpectedToSend > 0) {
				const pct = Math.round(
					(progressData.totalBytesSent / progressData.totalBytesExpectedToSend) * 100
				);
				params.onProgress(Math.min(99, pct));
			}
		}
	);

	const result = await uploadTask.uploadAsync();
	if (!result || result.status < 200 || result.status >= 300) {
		throw new Error('Media upload to home lab failed.');
	}
	params.onProgress?.(100);
	const parsed = JSON.parse(result.body);
	return parsed.media;
}

export function createMobileWebSocket(onEvent: (event: any) => void): WebSocket | null {
	if (!cachedToken) return null;
	const wsBase = cachedServerUrl.replace(/^http/, 'ws');
	const ws = new WebSocket(`${wsBase}/api/ws?token=${encodeURIComponent(cachedToken)}`);
	ws.onmessage = (ev) => {
		try {
			onEvent(JSON.parse(ev.data));
		} catch {
			// ignore
		}
	};
	return ws;
}
