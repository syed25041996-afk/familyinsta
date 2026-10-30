import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	retries: 0,
	timeout: 30000,
	use: {
		baseURL: 'http://localhost:3000',
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:3000/api/health',
		reuseExistingServer: true,
		timeout: 60000
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Pixel 7'] }
		}
	]
});
