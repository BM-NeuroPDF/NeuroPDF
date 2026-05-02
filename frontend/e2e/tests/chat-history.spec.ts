import { test, expect } from '@playwright/test';
import { isMobileViewport, login } from '../support/helpers';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test1@gmail.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'Test1234.';

/** Backend ile uyumlu: GET /files/chat/sessions */
const MOCK_SESSIONS_BODY = {
  sessions: [
    {
      id: 'db-session-123',
      session_id: 'ai-123',
      pdf_name: 'Finans_Raporu_2024.pdf',
      title: 'Finans_Raporu_2024.pdf',
      pdf_id: null,
      created_at: '2024-01-01T10:00:00.000Z',
      updated_at: '2024-01-01T10:05:00.000Z',
    },
  ],
};

/** Backend ile uyumlu: GET .../messages */
const MOCK_MESSAGES_BODY = {
  messages: [
    {
      role: 'user',
      content: 'Bu raporun ana fikri nedir?',
      created_at: '2024-01-01T10:01:00.000Z',
    },
    {
      role: 'assistant',
      content: 'Şirket kârlılığını %15 artırmıştır.',
      created_at: '2024-01-01T10:02:00.000Z',
    },
  ],
};

/** Backend ile uyumlu: POST .../resume (pdf_id null = blob isteği yok) */
const MOCK_RESUME_BODY = {
  session_id: 'ai-123',
  pdf_id: null,
  db_session_id: 'db-session-123',
  filename: 'Finans_Raporu_2024.pdf',
};

test.describe('Chat History E2E', () => {
  test('lists mocked sessions on sidebar and restores chat on click', async ({
    page,
  }) => {
    // Tarayıcı sendRequest ile /files/... yerine App Router proxy'sini kullanır (api.ts).
    await page.route('**/api/proxy/chat/sessions**', async (route) => {
      const req = route.request();
      const method = req.method();
      const path = new URL(req.url()).pathname;

      if (method === 'GET' && path === '/api/proxy/chat/sessions') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SESSIONS_BODY),
        });
        return;
      }

      if (
        method === 'GET' &&
        path.includes('db-session-123') &&
        path.endsWith('/messages')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_MESSAGES_BODY),
        });
        return;
      }

      if (
        method === 'POST' &&
        path.includes('db-session-123') &&
        path.endsWith('/resume')
      ) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_RESUME_BODY),
        });
        return;
      }

      await route.continue();
    });

    await login(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/upload');
    await page.waitForLoadState('domcontentloaded');

    // Mobil/tablet: Belgeler paneli drawer ile açılır (ResponsivePdfPanel).
    if (isMobileViewport(page)) {
      const panelTrigger = page.getByTestId('mobile-pdf-panel-trigger');
      await expect(panelTrigger).toBeVisible({ timeout: 15000 });
      await panelTrigger.click();
    }

    const recentChatsText = page
      .getByText(/Geçmiş sohbetler|Recent chats/i)
      .first();
    await expect(recentChatsText).toBeVisible({ timeout: 10000 });

    await expect(page.getByText('Finans_Raporu_2024.pdf')).toBeVisible({
      timeout: 15000,
    });

    const historyButton = page
      .locator('button')
      .filter({ has: page.locator('p[title="Finans_Raporu_2024.pdf"]') })
      .first();
    await expect(historyButton).toBeVisible();
    await page.waitForTimeout(2000);
    const resumePromise = page.waitForRequest(
      (req) =>
        (req.url().includes('/api/proxy/chat/sessions/') ||
          req.url().includes('/files/chat/sessions/')) &&
        req.url().includes('resume') &&
        req.method() === 'POST'
    );
    await historyButton.click();

    await resumePromise;

    const messagesArea = page.locator('.chat-messages-area');
    await expect(
      messagesArea.getByText('Bu raporun ana fikri nedir?')
    ).toBeVisible({ timeout: 15000 });
    await expect(
      messagesArea.getByText(/Şirket kârlılığını %15 artırmıştır/)
    ).toBeVisible({ timeout: 15000 });

    await expect(historyButton).toHaveClass(/ring-2/);
  });
});
