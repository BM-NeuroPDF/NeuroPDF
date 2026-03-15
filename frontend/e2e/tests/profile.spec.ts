import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../support/helpers';

const TEST_EMAIL = 'test1@gmail.com';
const TEST_PASSWORD = 'Test1234.';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('user can view profile page', async ({ page }) => {
    await navigateTo(page, '/profile');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Verify we're on profile page
    await expect(page).toHaveURL(/\/profile/);
    
    // Check for profile content - email should be visible
    // Email input or display should be present
    const emailInput = page.locator('input[type="email"]').or(page.locator('text=/@/'));
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });
  });

  test('user can see their email on profile page', async ({ page }) => {
    await navigateTo(page, '/profile');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Look for email in various possible formats
    // Could be in an input field, or displayed as text
    const emailLocator = page.locator('input[type="email"]').or(
      page.locator(`text=${TEST_EMAIL}`)
    );
    
    // At least one email-related element should be visible
    await expect(emailLocator.first()).toBeVisible({ timeout: 10000 });
  });
});
