import { expect, test } from '@playwright/test';

// Placeholder so the E2E harness is wired before the SPA exists. Skipped until there is a running app to drive.
test.skip('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Viral oder Egal/);
});
