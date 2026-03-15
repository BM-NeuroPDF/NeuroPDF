import { test, expect } from '@playwright/test';
import { login } from '../support/helpers';
import path from 'path';

const TEST_EMAIL = 'test1@gmail.com';
const TEST_PASSWORD = 'Test1234.';

const CHAT_RESPONSE_TIMEOUT = 120000;

test.describe('PDF Chat E2E', () => {
  test('user can upload PDF, open chat and receive assistant response', async ({ page }) => {
    test.setTimeout(CHAT_RESPONSE_TIMEOUT + 60000);

    await login(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/summarize-pdf');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.locator('text=/summarize|Özetle|PDF Özetleme/i').first()
    ).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(
      page.locator('[data-testid="pdf-viewer"]').or(page.locator('text=/sample\.pdf|PDF loaded/i')).first()
    ).toBeVisible({ timeout: 10000 });

    const chatButton = page.getByRole('button', { name: /Sohbet Et|Chat/i });
    await expect(chatButton).toBeVisible({ timeout: 5000 });
    await expect(chatButton).toBeEnabled({ timeout: 2000 });
    await chatButton.click();

    const chatInput = page.locator('input.chat-input-field').first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });
    await chatInput.fill('Bu PDF ne hakkında?');
    await chatInput.press('Enter');

    const lastAssistantBubble = page.locator('.chat-bubble-ai').last();
    await expect(lastAssistantBubble).toBeVisible({ timeout: CHAT_RESPONSE_TIMEOUT });

    const text = await lastAssistantBubble.textContent();
    expect((text ?? '').trim().length).toBeGreaterThan(0);
  });
});
