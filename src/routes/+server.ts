import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		service: 'Kinship Mobile API & Media Server',
		client: 'Android & iOS Native App (mobile/)',
		endpoints: [
			'/api/health',
			'/api/mobile/bootstrap',
			'/api/mobile/profile/[username]',
			'/api/mobile/search',
			'/api/mobile/admin',
			'/api/auth/login',
			'/api/auth/signup',
			'/api/auth/logout',
			'/api/posts',
			'/api/stories',
			'/api/albums',
			'/api/conversations',
			'/api/notifications',
			'/api/media/upload',
			'/api/ws'
		]
	});
};
