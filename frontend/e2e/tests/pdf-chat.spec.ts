import { test, expect, type Page } from '@playwright/test';
import { login } from '../support/helpers';
import { proUser, standardUser } from '../fixtures/test-data';
import path from 'path';

const CHAT_RESPONSE_TIMEOUT = 120000;

async function openGlobalChatFab(page: Page) {
  const fabButton = page
    .getByRole('button', { name: /AI Asistanı|Neuro AI/i })
    .first();
  await expect(fabButton).toBeVisible({ timeout: 15_000 });
  await fabButton.click();
}

async function waitForProcessingToSettle(page: Page) {
  await expect(page.locator('.loading-spinner')).toBeHidden({
    timeout: 10_000,
  });
}

test.describe('PDF Chat E2E', () => {
  test('user can upload PDF, open chat and receive assistant response', async ({
    page,
  }) => {
    test.setTimeout(CHAT_RESPONSE_TIMEOUT + 60000);

    await login(page, proUser.email, proUser.password, {
      username: proUser.username,
      requirePro: true,
    });

    await page.goto('/summarize-pdf');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/.*summarize-pdf/);
    await expect(page.locator('input[type="file"]').first()).toBeAttached({
      timeout: 10_000,
    });

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    await fileInput.setInputFiles(pdfPath);

    await expect(
      page
        .locator('[data-testid="pdf-viewer"]')
        .or(page.locator('text=/sample\.pdf|PDF loaded/i'))
        .first()
    ).toBeVisible({ timeout: 10000 });

    const chatButton = page
      .getByRole('button', { name: /Sohbet Et|Chat/i })
      .first();
    if (await chatButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(chatButton).toBeEnabled({ timeout: 2_000 });
      await chatButton.click();
    }

    // Panel otomatik açılmadıysa FAB üzerinden zorla aç.
    const chatInput = page.locator('.chat-input-field').first();
    if (!(await chatInput.isVisible().catch(() => false))) {
      await openGlobalChatFab(page);
    }
    await expect(chatInput).toBeVisible({ timeout: 30_000 });
    await chatInput.fill('Bu PDF ne hakkında?');
    await chatInput.press('Enter');
    await waitForProcessingToSettle(page);

    const lastAssistantBubble = page.locator('.chat-bubble-ai').last();
    await expect(lastAssistantBubble).toBeVisible({
      timeout: CHAT_RESPONSE_TIMEOUT,
    });

    const text = await lastAssistantBubble.textContent();
    expect((text ?? '').trim().length).toBeGreaterThan(0);
  });

  test('Standard User sees Pro Upgrade Modal', async ({ page }) => {
    await login(page, standardUser.email, standardUser.password, {
      username: standardUser.username,
      seedUser: true,
    });

    await page.goto('/summarize-pdf');
    await page.waitForLoadState('domcontentloaded');

    const fileInput = page.locator('input[type="file"]').first();
    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    await fileInput.setInputFiles(pdfPath);

    const chatButton = page
      .getByRole('button', { name: /Sohbet Et|Chat/i })
      .first();
    if (await chatButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await chatButton.click();
    } else {
      await openGlobalChatFab(page);
    }

    await expect(
      page.getByText(/Pro Üyelik Gerekli|Pro Membership Required/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.chat-input-field').first()).not.toBeVisible();
  });
});
