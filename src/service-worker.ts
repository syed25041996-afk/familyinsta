/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE_NAME = `kinship-cache-${version}`;
const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE_NAME) await caches.delete(key);
			}
			await sw.clients.claim();
		})
	);
});

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);

	// Never cache private API or signed media URLs in public SW cache
	if (url.pathname.startsWith('/api/')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			if (ASSETS.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}
			try {
				return await fetch(event.request);
			} catch {
				const cached = await cache.match(event.request);
				if (cached) return cached;
				throw new Error('Network offline');
			}
		})()
	);
});

// Web Push Notification Handler (Android & iOS 16.4+ PWA)
sw.addEventListener('push', (event) => {
	if (!event.data) return;
	try {
		const payload = event.data.json() as {
			title?: string;
			body?: string;
			url?: string;
			tag?: string;
		};
		event.waitUntil(
			sw.registration.showNotification(payload.title || 'Kinship Family', {
				body: payload.body || 'New family activity',
				icon: '/icon.svg',
				badge: '/icon.svg',
				tag: payload.tag || 'kinship-notification',
				data: { url: payload.url || '/' }
			})
		);
	} catch {
		// Ignore malformed push event
	}
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const targetUrl = (event.notification.data?.url as string) || '/';
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if ('focus' in client) {
					client.navigate(targetUrl);
					return client.focus();
				}
			}
			return sw.clients.openWindow(targetUrl);
		})
	);
});
