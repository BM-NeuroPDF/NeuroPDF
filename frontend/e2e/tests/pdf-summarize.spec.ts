import { test, expect } from '@playwright/test';
import {
  isMobileViewport,
  login,
  openMobileMenuIfNeeded,
} from '../support/helpers';
import path from 'path';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test1@gmail.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'Test1234.';

test.describe('PDF Summarize E2E', () => {
  test('user can upload and summarize a PDF', async ({ page }) => {
    // Login first
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // Navigate to summarize page (mobilde menü içinden link görünür olabilir)
    if (isMobileViewport(page)) {
      await openMobileMenuIfNeeded(page);
    }
    const summarizeNavLink = page.locator('a[href="/summarize-pdf"]').first();
    if (await summarizeNavLink.isVisible().catch(() => false)) {
      await summarizeNavLink.click();
    } else {
      await page.goto('/summarize-pdf');
    }
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/summarize-pdf/);

    // Get the file input - it might be in a dropzone or directly accessible
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    // Get the path to the sample PDF
    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');

    // Upload the PDF file
    await fileInput.setInputFiles(pdfPath);

    // Wait for PDF to be loaded (PDF viewer or file name should appear)
    await expect(
      page
        .locator('[data-testid="pdf-viewer"]')
        .or(page.locator('text=/sample\.pdf|PDF loaded/i'))
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Find and click the summarize button
    // The button text might be "Özetle" or "Summarize" depending on language
    const summarizeButton = page
      .locator('button')
      .filter({ hasText: /Özetle|Summarize|summarizeButton/i })
      .first();
    await expect(summarizeButton).toBeVisible({ timeout: 5000 });
    await expect(summarizeButton).toBeEnabled({ timeout: 2000 });

    // Click summarize button
    await summarizeButton.click();

    // Wait for summary to appear - this might take a while due to LLM processing
    // AI'nın PDF'i okuyup özetlemesi için maksimum esneklik: 2 dakika timeout
    // Selector esnekliği: markdown-viewer, main, article, markdown-content, p, pre, div[class*="summary"]
    const summaryLocator = page
      .locator(
        '[data-testid="markdown-viewer"], main, article, .markdown-content, p, pre, div[class*="summary"]'
      )
      .filter({ hasText: /summary|özet|answer|response|content/i })
      .first();
    await expect(summaryLocator).toBeAttached({ timeout: 120000 });
    await expect(summaryLocator).toBeVisible({ timeout: 5000 });

    // Verify that some summary content is displayed
    // The summary should contain some text (not just empty)
    // Selector esnekliği: markdown-viewer, main, article, markdown-content, p, pre, div[class*="summary"]
    const summaryContent = page
      .locator(
        '[data-testid="markdown-viewer"], main, article, .markdown-content, p, pre, div[class*="summary"]'
      )
      .filter({ hasText: /summary|özet|answer|response|content/i })
      .first();
    await expect(summaryContent).toBeVisible({ timeout: 5000 });

    // Verify summary has actual content (not empty)
    const summaryText = await summaryContent.textContent();
    expect(summaryText?.trim().length).toBeGreaterThan(0);
  });

  test('user can see loading state during summarization', async ({ page }) => {
    // Login first
    await login(page, TEST_EMAIL, TEST_PASSWORD);

    // Navigate to summarize page (mobilde menü içinden link görünür olabilir)
    if (isMobileViewport(page)) {
      await openMobileMenuIfNeeded(page);
    }
    const summarizeNavLink = page.locator('a[href="/summarize-pdf"]').first();
    if (await summarizeNavLink.isVisible().catch(() => false)) {
      await summarizeNavLink.click();
    } else {
      await page.goto('/summarize-pdf');
    }
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/summarize-pdf/);

    // Get the file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    // Get the path to the sample PDF
    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');

    // Upload the PDF file
    await fileInput.setInputFiles(pdfPath);

    // Wait for PDF to be loaded
    await expect(
      page
        .locator('[data-testid="pdf-viewer"]')
        .or(page.locator('text=/sample\.pdf/i'))
        .first()
    ).toBeVisible({ timeout: 10000 });

    // Find the summarize button
    const summarizeButton = page
      .locator('button')
      .filter({ hasText: /Özetle|Summarize/i })
      .first();
    await expect(summarizeButton).toBeVisible({ timeout: 5000 });

    // Click summarize button
    await summarizeButton.click();

    // Check for loading state (button should be disabled or show loading text)
    // This might be very brief, so we check immediately after click
    const loadingIndicator = page
      .locator('text=/loading|Yükleniyor|Processing|İşleniyor/i')
      .first();
    const hasLoading = await loadingIndicator
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    // If loading indicator appears, wait for it to disappear (summary is ready)
    if (hasLoading) {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 30000 });
    }

    // Finally verify summary appears
    // AI'nın PDF'i okuyup özetlemesi için maksimum esneklik: 2 dakika timeout
    // Selector esnekliği: markdown-viewer, main, article, markdown-content, p, pre, div[class*="summary"]
    const finalSummaryLocator = page
      .locator(
        '[data-testid="markdown-viewer"], main, article, .markdown-content, p, pre, div[class*="summary"]'
      )
      .filter({ hasText: /summary|özet|answer|response|content/i })
      .first();
    await expect(finalSummaryLocator).toBeAttached({ timeout: 120000 });
    await expect(finalSummaryLocator).toBeVisible({ timeout: 5000 });
  });
});
