import { test, expect } from '@playwright/test';
import { login } from '../support/helpers';
import path from 'path';
import fs from 'fs';

/**
 * Pro kullanıcı + PdfContext'te PDF: ProGlobalChat /files/chat/message yanıtındaki
 * client_actions → EXTRACT_PAGES_LOCAL | MERGE_PDFS_LOCAL → pdf-lib → Sonner toast.
 *
 * Not: e2e/fixtures/sample.pdf tek sayfalıdır; kesim 1-1 ile başarılı olur.
 * Birleştirme için aynı buffer iki farklı dosya adıyla yüklenir (pdfList duplicate-name kuralı).
 * Ağ seviyesinde LLM beklenmez; yalnızca chat message mock'lanır.
 */
const TEST_EMAIL = 'test1@gmail.com';
const TEST_PASSWORD = 'Test1234.';

test.describe('Chat client_actions', () => {
  test('EXTRACT_PAGES_LOCAL mock response shows success toast', async ({ page }) => {
    test.setTimeout(120_000);

    await page.route('**/files/chat/message', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer: 'Sayfaları ayırıyorum.',
          client_actions: [
            {
              type: 'EXTRACT_PAGES_LOCAL',
              // sample.pdf = 1 page; 1–2 would show error toast
              payload: { start_page: 1, end_page: 1 },
            },
          ],
        }),
      });
    });

    try {
      await login(page, TEST_EMAIL, TEST_PASSWORD);

      await page.goto('/upload');
      await page.waitForLoadState('domcontentloaded');

      const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
      await page.locator('input[type="file"]').first().setInputFiles(pdfPath);

      await page.getByRole('button', { name: /^Yükle$|^Upload$/i }).click();

      const fab = page.getByRole('button', { name: /ai asistanı/i });
      await expect(fab).toBeVisible({ timeout: 90_000 });

      await fab.click();

      const chatInput = page.locator('input.chat-input-field').first();
      await expect(chatInput).toBeVisible({ timeout: 20_000 });
      await expect(chatInput).toBeEnabled({ timeout: 90_000 });

      await chatInput.fill('kes');
      await page.getByTestId('chat-send-button').click();

      await expect(page.getByText('Sayfalar başarıyla ayrıldı')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await page.unroute('**/files/chat/message');
    }
  });

  test('should merge multiple PDFs via client_actions', async ({ page }) => {
    test.setTimeout(120_000);

    await page.route('**/files/chat/message', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer: 'Dosyaları birleştiriyorum.',
          client_actions: [{ type: 'MERGE_PDFS_LOCAL', payload: {} }],
        }),
      });
    });

    try {
      const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
      const pdfBuffer = fs.readFileSync(pdfPath);

      await login(page, TEST_EMAIL, TEST_PASSWORD);

      await page.goto('/upload');
      await page.waitForLoadState('domcontentloaded');

      await page.locator('input[type="file"]').first().setInputFiles([
        {
          name: 'merge1.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer,
        },
        {
          name: 'merge2.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer,
        },
      ]);

      await page.getByRole('button', { name: /^Yükle$|^Upload$/i }).click();

      const fab = page.getByRole('button', { name: /ai asistanı/i });
      await expect(fab).toBeVisible({ timeout: 90_000 });

      await fab.click();

      const chatInput = page.locator('input.chat-input-field').first();
      await expect(chatInput).toBeVisible({ timeout: 20_000 });
      await expect(chatInput).toBeEnabled({ timeout: 90_000 });

      await chatInput.fill('birleştir');
      await page.getByTestId('chat-send-button').click();

      await expect(
        page.getByText('Tüm PDF dosyaları başarıyla birleştirildi')
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await page.unroute('**/files/chat/message');
    }
  });
});
