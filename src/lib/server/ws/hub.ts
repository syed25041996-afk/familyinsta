import type { WebSocket } from 'ws';

export interface WsEventPayload {
	type:
		| 'chat:message'
		| 'chat:typing'
		| 'chat:read'
		| 'notification:new'
		| 'media:ready'
		| 'story:new';
	data: Record<string, unknown>;
}

// Map of userId -> Set of active WebSocket connections
const userSockets = new Map<string, Set<WebSocket>>();

export function registerUserSocket(userId: string, ws: WebSocket): void {
	let set = userSockets.get(userId);
	if (!set) {
		set = new Set();
		userSockets.set(userId, set);
	}
	set.add(ws);

	ws.on('close', () => {
		set?.delete(ws);
		if (set && set.size === 0) {
			userSockets.delete(userId);
		}
	});
}

export function broadcastToUser(userId: string, event: WsEventPayload): void {
	const sockets = userSockets.get(userId);
	if (!sockets || sockets.size === 0) return;

	const serialized = JSON.stringify(event);
	for (const ws of sockets) {
		if (ws.readyState === 1) {
			ws.send(serialized);
		}
	}
}

export function broadcastToUsers(userIds: string[], event: WsEventPayload): void {
	const unique = new Set(userIds);
	for (const uid of unique) {
		broadcastToUser(uid, event);
	}
}
