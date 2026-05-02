import { test, expect } from '@playwright/test';
import {
  dismissFabIfPresent,
  isMobileViewport,
  login,
  openMobileMenuIfNeeded,
} from '../support/helpers';
import path from 'path';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test1@gmail.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'Test1234.';

test.describe('PDF Merge E2E', () => {
  test('user can merge two PDFs and download result', async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    if (isMobileViewport(page)) {
      await openMobileMenuIfNeeded(page);
    }
    const mergeNavLink = page.locator('a[href="/merge-pdf"]').first();
    if (await mergeNavLink.isVisible().catch(() => false)) {
      await mergeNavLink.click();
    } else {
      await page.goto('/merge-pdf');
    }
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/merge-pdf/);

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    await fileInput.setInputFiles([pdfPath, pdfPath]);
    await expect(page.getByText(/sample\.pdf/i).first()).toBeVisible({
      timeout: 10000,
    });

    const mergeButton = page
      .getByRole('button', { name: /Birleştir|Merge/i })
      .first();
    await expect(mergeButton).toBeVisible({ timeout: 10000 });
    await mergeButton.scrollIntoViewIfNeeded();
    await dismissFabIfPresent(page);
    await mergeButton.click();

    const downloadButton = page.getByRole('button', {
      name: /İndir|Download/i,
    });
    await expect(downloadButton).toBeVisible({ timeout: 60000 });

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('merged.pdf');
    const savePath = await download.path();
    expect(savePath).toBeTruthy();
  });
});
