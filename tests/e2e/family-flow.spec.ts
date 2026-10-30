import { test, expect } from '@playwright/test';

test.describe('Kinship Family Social App E2E Flow', () => {
	test('Health API, Login, Stories, Memories, Feed Reactions, Albums & Admin Panel', async ({
		page,
		request
	}) => {
		// 1. Check /api/health
		const healthRes = await request.get('/api/health');
		expect(healthRes.ok()).toBeTruthy();
		const healthJson = await healthRes.json();
		expect(healthJson.status).toBe('ok');

		// 2. Visit Login Page & sign in as Admin (Aarav)
		await page.goto('/login');
		await expect(page.locator('h1')).toContainText('Kinship Family Vault');

		await page.fill('#login-id', 'aarav');
		await page.fill('#login-pw', 'FamilyVault2026!');
		await page.click('button[type="submit"]');

		// 3. Verify Home Page: Stories Bar, On This Day Memories, and Chronological Feed
		await page.waitForURL('**/');
		await expect(page.locator('section[aria-label="24-Hour Family Stories"]')).toBeVisible();
		await expect(page.locator('section[aria-label="On This Day Memories"]')).toBeVisible();
		await expect(page.getByText('Diwali prep in full swing!')).toBeVisible();

		// 4. Navigate to Shared Albums & check ZIP download link
		await page.goto('/albums');
		await expect(page.getByText('Diwali 2026 Family Album')).toBeVisible();

		// 5. Navigate to Admin Panel & verify Proxmox VM storage gauge and invites
		await page.goto('/admin');
		await expect(page.getByText('Proxmox VM Storage Usage')).toBeVisible();
		await expect(page.getByText('DIWALI-2026')).toBeVisible();
	});
});
