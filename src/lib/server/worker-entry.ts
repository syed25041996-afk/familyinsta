import { processNextJob } from './queue/index.js';
import { ensureSchema } from './db/index.js';
import { log } from './logger.js';

async function runWorkerLoop() {
	await ensureSchema();
	log('info', 'kinship_worker_started', { pid: process.pid });

	while (true) {
		try {
			const processed = await processNextJob();
			if (!processed) {
				await new Promise((r) => setTimeout(r, 2000));
			}
		} catch (err) {
			log('error', 'worker_loop_error', { error: String(err) });
			await new Promise((r) => setTimeout(r, 5000));
		}
	}
}

runWorkerLoop();
