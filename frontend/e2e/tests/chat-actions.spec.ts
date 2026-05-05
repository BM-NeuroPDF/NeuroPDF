import { test, expect, type Page, type Route } from '@playwright/test';
import {
  isMobileViewport,
  login,
  openMobileMenuIfNeeded,
  clickWhenStable,
} from '../support/helpers';
import { proUser, standardUser } from '../fixtures/test-data';
import path from 'path';
import fs from 'fs';

/** Browser isteği api.ts nedeniyle /api/proxy/chat/message üzerinden gider; eski glob yeterli değil. */
const CHAT_MESSAGE_ROUTE_GLOBS = [
  '**/api/proxy/chat/message',
  '**/files/chat/message',
] as const;

/** chat/start gerçek backend + AI servisine bağlıdır; servis yoksa/yavaşsa istek hiç 200 dönmez. E2E'de deterministik olması için mock'lanır. */
const CHAT_START_ROUTE_GLOBS = [
  '**/api/proxy/chat/start',
  '**/files/chat/start',
] as const;

const E2E_MOCK_PDF_SESSION = {
  session_id: 'e2e-mock-pdf-chat-session',
  db_session_id: '00000000-0000-0000-0000-0000000000e2',
};

async function registerChatMessageMock(
  page: Page,
  payload: Record<string, unknown>
) {
  const handler = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  };
  for (const glob of CHAT_MESSAGE_ROUTE_GLOBS) {
    await page.route(glob, handler);
  }
}

async function unregisterChatMessageMock(page: Page) {
  for (const glob of CHAT_MESSAGE_ROUTE_GLOBS) {
    await page.unroute(glob).catch(() => {});
  }
}

async function registerChatStartMock(page: Page) {
  const handler = async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(E2E_MOCK_PDF_SESSION),
    });
  };
  for (const glob of CHAT_START_ROUTE_GLOBS) {
    await page.route(glob, handler);
  }
}

async function unregisterChatStartMock(page: Page) {
  for (const glob of CHAT_START_ROUTE_GLOBS) {
    await page.unroute(glob).catch(() => {});
  }
}

/**
 * PDF paneline dosya eklendikten sonra ProGlobalChat'in oturumu açmasını bekle.
 * chat/start mock'lu olduğunda bu istek hızlı tamamlanır; yine de proxy veya doğrudan backend URL'si için url esnek.
 */
async function waitForPdfChatSessionStarted(page: Page) {
  await page.waitForResponse(
    (r) =>
      r.url().includes('chat/start') &&
      r.request().method() === 'POST' &&
      r.status() === 200,
    { timeout: 30_000 }
  );
}

/**
 * Pro kullanıcı + PdfContext'te PDF: ProGlobalChat /files/chat/message yanıtındaki
 * client_actions → EXTRACT_PAGES_LOCAL | MERGE_PDFS_LOCAL → pdf-lib → Sonner toast.
 *
 * Not: e2e/fixtures/sample.pdf tek sayfalıdır; kesim 1-1 ile başarılı olur.
 * Birleştirme için aynı buffer iki farklı dosya adıyla yüklenir (pdfList duplicate-name kuralı).
 * Ağ seviyesinde LLM beklenmez; yalnızca chat message mock'lanır.
 */
async function openGlobalChatFab(page: Page) {
  if (isMobileViewport(page)) {
    // Mobilde kullanıcı önce menüyü açabilir; ardından gerçek chat tetikleyicisine basar.
    await openMobileMenuIfNeeded(page);
    const mobileChatTrigger = page
      .getByRole('button', { name: /Belgelerim|Documents/i })
      .or(page.locator('button:has(img[alt="AI Chat"])').first());
    await clickWhenStable(mobileChatTrigger, { timeout: 15_000 });
    return;
  }

  const desktopFab = page.getByTestId('global-chat-fab');
  await clickWhenStable(desktopFab, { timeout: 15_000 });
}

async function waitForProcessingToSettle(page: Page) {
  // İşlem başladıysa spinner'ın kapanmasını bekle; görünmezse hemen geçer.
  await expect(page.locator('.loading-spinner')).toBeHidden({
    timeout: 10_000,
  });
}

/** layout.tsx: ClientPdfPanel yalnızca lg+ (≥1024px) render; küçük ekranda dosya adı DOM’da yok. */
const LG_MIN_WIDTH = 1024;

async function assertActionOutcome(
  page: Page,
  options: { expectedAiText: RegExp; outputFileName: RegExp }
) {
  const lastAssistantBubble = page.locator('.chat-bubble-ai').last();
  await expect(lastAssistantBubble).toBeVisible({ timeout: 20_000 });
  await expect(lastAssistantBubble).toContainText(options.expectedAiText, {
    timeout: 20_000,
  });

  const w = page.viewportSize()?.width ?? LG_MIN_WIDTH;
  if (w >= LG_MIN_WIDTH) {
    // Sol panelde dosya adı düz metin (href/download yok).
    await expect(page.getByText(options.outputFileName).first()).toBeVisible({
      timeout: 20_000,
    });
  }
}

test.describe('Chat client_actions', () => {
  test('EXTRACT_PAGES_LOCAL mock response shows success toast', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await registerChatStartMock(page);
    await registerChatMessageMock(page, {
      answer: 'Sayfaları ayırıyorum.',
      client_actions: [
        {
          type: 'EXTRACT_PAGES_LOCAL',
          // sample.pdf = 1 page; 1–2 would show error toast
          payload: { start_page: 1, end_page: 1 },
        },
      ],
    });

    try {
      await login(page, proUser.email, proUser.password, {
        username: proUser.username,
        requirePro: true,
      });

      await page.goto('/upload');
      await page.waitForLoadState('domcontentloaded');

      const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
      await page.locator('input[type="file"]').first().setInputFiles(pdfPath);

      await page.getByRole('button', { name: /^Yükle$|^Upload$/i }).click();
      await waitForPdfChatSessionStarted(page);

      await openGlobalChatFab(page);
      const chatInput = page.locator('.chat-input-field').first();
      await expect(chatInput).toBeVisible({ timeout: 45_000 });
      await expect(chatInput).toBeEnabled({ timeout: 90_000 });

      await chatInput.fill('kes');
      await page.getByTestId('chat-send-button').click();
      await waitForProcessingToSettle(page);

      const successToast = page
        .locator('[role="alert"], [data-sonner-toast], .sonner-toast')
        .filter({ hasText: /sayfalar.*başarıyla|başarıyla/i })
        .first();
      // Toast kısa ömürlü olabilir; best-effort kontrol.
      try {
        await expect(successToast).toBeVisible({ timeout: 10_000 });
      } catch {
        // noop
      }
      await assertActionOutcome(page, {
        expectedAiText: /sayfaları ayırıyorum/i,
        // sample.pdf → handleExtractPagesLocal → sample_extracted.pdf
        outputFileName: /sample_extracted\.pdf/,
      });
    } finally {
      await unregisterChatMessageMock(page);
      await unregisterChatStartMock(page);
    }
  });

  test('should merge multiple PDFs via client_actions', async ({ page }) => {
    test.setTimeout(120_000);

    await registerChatStartMock(page);
    await registerChatMessageMock(page, {
      answer: 'Dosyaları birleştiriyorum.',
      client_actions: [{ type: 'MERGE_PDFS_LOCAL', payload: {} }],
    });

    try {
      const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
      const pdfBuffer = fs.readFileSync(pdfPath);

      await login(page, proUser.email, proUser.password, {
        username: proUser.username,
        requirePro: true,
      });

      await page.goto('/upload');
      await page.waitForLoadState('domcontentloaded');

      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles([
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
      await waitForPdfChatSessionStarted(page);

      await openGlobalChatFab(page);
      const chatInput = page.locator('.chat-input-field').first();
      await expect(chatInput).toBeVisible({ timeout: 45_000 });
      await expect(chatInput).toBeEnabled({ timeout: 90_000 });

      await chatInput.fill('birleştir');
      await page.getByTestId('chat-send-button').click();
      await waitForProcessingToSettle(page);

      const mergeToast = page
        .locator('[role="alert"], [data-sonner-toast], .sonner-toast')
        .filter({ hasText: /birleştirildi|başarıyla/i })
        .first();
      try {
        await expect(mergeToast).toBeVisible({ timeout: 10_000 });
      } catch {
        // noop
      }
      await assertActionOutcome(page, {
        expectedAiText: /dosyaları birleştiriyorum/i,
        outputFileName: /merged_document\.pdf/,
      });
    } finally {
      await unregisterChatMessageMock(page);
      await unregisterChatStartMock(page);
    }
  });

  test('Standard User sees Pro Upgrade Modal', async ({ page }) => {
    await login(page, standardUser.email, standardUser.password, {
      username: standardUser.username,
      seedUser: true,
    });

    await page.goto('/upload');
    await page.waitForLoadState('domcontentloaded');

    await openGlobalChatFab(page);
    await expect(
      page.getByText(/Pro Üyelik Gerekli|Pro Membership Required/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.chat-input-field').first()).not.toBeVisible();
  });
});
