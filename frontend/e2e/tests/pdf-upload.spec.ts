import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../support/auth';
import path from 'path';

test.describe('PDF Upload E2E', () => {
  test('user can upload a PDF file', async ({ page }) => {
    // Login first
    await loginAsTestUser(page);

    // Navigate to upload page
    await page.goto('/upload');
    await page.waitForLoadState('domcontentloaded');

    // Wait for upload page to be ready
    await expect(
      page.locator('text=/uploadPageTitle|Neuro PDF|Yükleme|Upload/i').first()
    ).toBeVisible({ timeout: 10000 });

    // Get the file input - it might be in a label or directly accessible
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    // Get the path to the sample PDF
    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');

    // Upload the PDF file
    await fileInput.setInputFiles(pdfPath);

    // Wait for PDF viewer to appear after file selection
    // Check for PDF viewer component or file name display
    await expect(
      page
        .locator('[data-testid="pdf-viewer"]')
        .or(page.locator('text=/sample\.pdf|currentFile/i'))
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Verify upload button is visible and enabled
    const uploadButton = page
      .locator('button')
      .filter({ hasText: /uploadButton|Yükle|Upload/i })
      .first();
    await expect(uploadButton).toBeVisible({ timeout: 5000 });
    await expect(uploadButton).toBeEnabled({ timeout: 2000 });

    // Click upload button to add PDF to panel
    await uploadButton.click();

    // Wait for success message in popup
    await expect(
      page
        .locator('.fixed.top-6.right-6')
        .filter({
          hasText: /uploadSuccess|Yüklendi|Uploaded|success|Başarıyla/i,
        })
        .first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('user can see PDF viewer after file selection', async ({ page }) => {
    // Login first
    await loginAsTestUser(page);

    // Navigate to upload page
    await page.goto('/upload');
    await page.waitForLoadState('domcontentloaded');

    // Wait for upload page to be ready
    await expect(
      page.locator('text=/uploadPageTitle|Neuro PDF|Yükleme|Upload/i').first()
    ).toBeVisible({ timeout: 10000 });

    // Get the file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    // Get the path to the sample PDF
    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');

    // Upload the PDF file
    await fileInput.setInputFiles(pdfPath);

    // Wait for PDF viewer to appear
    // Check for PDF viewer component or file name display
    await expect(
      page
        .locator('[data-testid="pdf-viewer"]')
        .or(page.locator('text=/sample\.pdf|currentFile/i'))
        .first()
    ).toBeVisible({ timeout: 10000 });
  });
});
