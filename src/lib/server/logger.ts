export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export function log(level: LogLevel, event: string, meta: Record<string, unknown> = {}) {
	const entry = {
		timestamp: new Date().toISOString(),
		level,
		event,
		...meta
	};
	if (level === 'error') {
		console.error(JSON.stringify(entry));
	} else {
		console.log(JSON.stringify(entry));
	}
}
