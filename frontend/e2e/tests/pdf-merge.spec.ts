import { test, expect } from '@playwright/test';
import { login } from '../support/helpers';
import path from 'path';

const TEST_EMAIL = 'test1@gmail.com';
const TEST_PASSWORD = 'Test1234.';

test.describe('PDF Merge E2E', () => {
  test('user can merge two PDFs and download result', async ({ page }) => {
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/merge-pdf');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('text=/mergePageTitle|Birleştir|Merge|PDF Birleştirici/i').first()
    ).toBeVisible({ timeout: 10000 });

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    await fileInput.setInputFiles([pdfPath, pdfPath]);

    await expect(
      page.locator('text=/selectedFiles|Seçilen|sample\\.pdf/i').first()
    ).toBeVisible({ timeout: 10000 });

    const filesList = page.locator('ul.container-card li');
    await expect(filesList).toHaveCount(2, { timeout: 5000 });

    const mergeButton = page.locator('button').filter({ hasText: /mergeButton|Birleştir|Merge PDFs/i }).first();
    await expect(mergeButton).toBeVisible({ timeout: 5000 });
    await expect(mergeButton).toBeEnabled({ timeout: 2000 });
    await mergeButton.click();

    const downloadButton = page.getByRole('button', { name: /İndir|Download/i });
    await expect(downloadButton).toBeVisible({ timeout: 60000 });

    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('merged.pdf');
    const savePath = await download.path();
    expect(savePath).toBeTruthy();
  });
});
