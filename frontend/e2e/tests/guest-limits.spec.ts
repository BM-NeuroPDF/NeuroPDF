import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Guest limits E2E', () => {
  test('guest sees usage limit modal after limit and is redirected to login', async ({ page }) => {
    await page.goto('/merge-pdf');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('text=/mergePageTitle|Birleştir|Merge|PDF Birleştirici/i').first()
    ).toBeVisible({ timeout: 10000 });

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 3; i++) {
      await fileInput.setInputFiles([pdfPath, pdfPath]);
      await expect(
        page.locator('ul.container-card li').first()
      ).toBeVisible({ timeout: 10000 });

      const mergeButton = page.locator('button').filter({ hasText: /mergeButton|Birleştir|Merge PDFs/i }).first();
      await expect(mergeButton).toBeEnabled({ timeout: 5000 });
      await mergeButton.click();

      const downloadButton = page.getByRole('button', { name: /İndir|Download/i });
      await expect(downloadButton).toBeVisible({ timeout: 60000 });

      const newProcessButton = page.getByRole('button', { name: /Yeni İşlem|New Process/i });
      await expect(newProcessButton).toBeVisible({ timeout: 5000 });
      await newProcessButton.click();

      await expect(
        page.locator('button').filter({ hasText: /mergeButton|Birleştir|Merge PDFs/i }).first()
      ).toBeVisible({ timeout: 10000 });
    }

    await fileInput.setInputFiles([pdfPath, pdfPath]);
    await expect(
      page.locator('ul.container-card li').first()
    ).toBeVisible({ timeout: 10000 });

    const mergeButton = page.locator('button').filter({ hasText: /mergeButton|Birleştir|Merge PDFs/i }).first();
    await mergeButton.click();

    const modalTitle = page.locator('text=Kullanım Limitine Ulaştınız');
    await expect(modalTitle).toBeVisible({ timeout: 10000 });

    const loginButton = page.getByRole('button', { name: /Giriş Yap|Login/i });
    await expect(loginButton).toBeVisible({ timeout: 5000 });
    await loginButton.click();

    await expect(page).toHaveURL(/.*login/, { timeout: 15000 });
  });
});
