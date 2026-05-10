import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { E2E_PRIMARY_EMAIL } from '../fixtures/credentials';
import { loginAsTestUser } from '../support/auth';
import { isE2EFullLoginViable } from '../support/e2e-auth-probe';
import { navigateTo } from '../support/helpers';

const defaultBackendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';

async function isBackendHealthy(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${defaultBackendUrl}/health`, {
      failOnStatusCode: false,
      timeout: 5000,
    });
    return res.ok();
  } catch {
    return false;
  }
}

async function assertDocumentTheme(page: Page, theme: 'light' | 'dark') {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')), {
      timeout: 15_000,
      message: `Expected <html> .dark=${theme === 'dark'}`,
    })
    .toBe(theme === 'dark');
}

/**
 * Phase 10: authenticated smoke for /profile and /documents (requires backend + E2E user; OTP if enabled).
 *
 * PLAYWRIGHT_BASE_URL=https://127.0.0.1:3000 npx playwright test e2e/tests/phase10-authenticated-routes.spec.ts --project=chromium --workers=1
 */
test.describe('Phase 10 — authenticated routes', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ request }, testInfo) => {
    if (!(await isBackendHealthy(request))) {
      testInfo.skip(
        true,
        `Backend not reachable at ${defaultBackendUrl}/health — start the stack for authenticated E2E.`,
      );
      return;
    }
    if (!(await isE2EFullLoginViable(request))) {
      testInfo.skip(
        true,
        `E2E full auth chain failed for ${E2E_PRIMARY_EMAIL} (login → verify-2fa). Check user seed, Redis, E2E_MAGIC_OTP_* on backend, and E2E_OTP_CODE (e.g. 123456 in CI).`,
      );
      return;
    }
  });

  test('documents shows authenticated workspace (not guest gate)', async ({ page }) => {
    await loginAsTestUser(page);
    await navigateTo(page, '/documents');
    await expect(page).toHaveURL(/\/documents/);

    await expect(page.getByRole('heading', { name: 'Belgelerim', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByText('Belgelerinizi görmek için giriş yapmanız gerekiyor.', {
        exact: true,
      }),
    ).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Yenile' })).toBeVisible({
      timeout: 15_000,
    });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`theme ${theme}: profile and documents stay on-theme`, async ({ page, context }) => {
      await context.addInitScript((t) => {
        const mode = t as 'light' | 'dark';
        window.localStorage.setItem('theme', mode);
        document.documentElement.classList.toggle('dark', mode === 'dark');
      }, theme);

      await loginAsTestUser(page);

      await navigateTo(page, '/profile');
      await assertDocumentTheme(page, theme);

      await navigateTo(page, '/documents');
      await assertDocumentTheme(page, theme);
      await expect(page.getByRole('heading', { name: 'Belgelerim', exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });
  }
});
