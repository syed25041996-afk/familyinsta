import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, ensureSchema } from '$lib/server/db/index.js';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		await ensureSchema();
		await db.execute(sql`SELECT 1`);
		const mem = process.memoryUsage();
		return json({
			status: 'ok',
			app: 'kinship-familygram',
			timestamp: new Date().toISOString(),
			uptimeSec: Math.round(process.uptime()),
			memoryRssMb: Math.round(mem.rss / 1024 / 1024)
		});
	} catch (err) {
		return json(
			{
				status: 'error',
				error: err instanceof Error ? err.message : 'Database check failed'
			},
			{ status: 500 }
		);
	}
};
