import { ensureSchema } from '../src/lib/server/db/index.js';

async function main() {
	console.log('Ensuring Kinship PostgreSQL database schema...');
	await ensureSchema();
	console.log('Database schema is up to date.');
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
