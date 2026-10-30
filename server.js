import http from 'node:http';
import { WebSocketServer } from 'ws';
import { parse as parseCookie } from 'cookie';
import { handler } from './build/handler.js';

const port = Number(process.env.PORT || 3000);
const server = http.createServer(handler);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
	if (!req.url?.startsWith('/api/ws')) {
		socket.destroy();
		return;
	}

	try {
		const cookies = parseCookie(req.headers.cookie || '');
		const token = cookies['kinship_session'];
		if (!token) {
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			return;
		}

		const { validateSessionToken } = await import('./src/lib/server/auth/index.ts').catch(
			() => ({ validateSessionToken: null })
		);

		wss.handleUpgrade(req, socket, head, async (ws) => {
			if (validateSessionToken) {
				const sessionData = await validateSessionToken(token);
				if (sessionData) {
					const { registerUserSocket } = await import('./src/lib/server/ws/hub.ts');
					registerUserSocket(sessionData.user.id, ws);
				}
			}
			ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
		});
	} catch {
		socket.destroy();
	}
});

server.listen(port, '0.0.0.0', () => {
	console.log(
		JSON.stringify({
			timestamp: new Date().toISOString(),
			level: 'info',
			event: 'kinship_server_listening',
			port
		})
	);
});
