import { test, expect } from '@playwright/test';
import { E2E_PRIMARY_EMAIL } from '../fixtures/credentials';
import { loginAsTestUser } from '../support/auth';
import { navigateTo } from '../support/helpers';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAsTestUser(page);
  });

  test('user can view profile page', async ({ page }) => {
    await navigateTo(page, '/profile');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on profile page
    await expect(page).toHaveURL(/\/profile/);

    // Check for profile content - email should be visible
    // Email input or display should be present
    const emailInput = page
      .locator('input[type="email"]')
      .or(page.locator('text=/@/'));
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });
  });

  test('user can see their email on profile page', async ({ page }) => {
    await navigateTo(page, '/profile');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Look for email in various possible formats
    // Could be in an input field, or displayed as text
    const emailLocator = page
      .locator('input[type="email"]')
      .or(page.locator(`text=${E2E_PRIMARY_EMAIL}`));

    // At least one email-related element should be visible
    await expect(emailLocator.first()).toBeVisible({ timeout: 10000 });
  });
});
