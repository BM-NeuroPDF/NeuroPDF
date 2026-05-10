import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 9 closure: legacy CSS aliases removed; verify core routes in light/dark
 * without requiring a logged-in session (clean browser context).
 *
 * Run: PLAYWRIGHT_BASE_URL=https://127.0.0.1:3000 npx playwright test e2e/tests/phase9-theme-routes.spec.ts --project=chromium
 */
const ROUTES = ['/login', '/', '/upload', '/summarize-pdf', '/profile', '/documents'] as const;

async function assertDocumentTheme(page: Page, theme: 'light' | 'dark') {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')), {
      timeout: 15_000,
      message: `Expected <html> .dark=${theme === 'dark'}`,
    })
    .toBe(theme === 'dark');
}

async function assertNoObviousCrashOverlay(page: Page) {
  await expect(
    page.getByText(/Application error|Unhandled Runtime|ChunkLoadError|Something went wrong/i),
  ).toHaveCount(0);
  await expect(page.locator('body')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Phase 9 theme smoke — ${theme}`, () => {
    test.beforeEach(async ({ context }) => {
      await context.addInitScript((t) => {
        const mode = t as 'light' | 'dark';
        window.localStorage.setItem('theme', mode);
        document.documentElement.classList.toggle('dark', mode === 'dark');
      }, theme);
    });

    for (const path of ROUTES) {
      test(`loads ${path}`, async ({ page }) => {
        const res = await page.goto(path, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
        expect(res?.status(), `${path} HTTP status`).toBeLessThan(400);

        if (path === '/profile') {
          await page.waitForURL(/\/login|\/profile/, { timeout: 25_000 });
          if (page.url().includes('/login')) {
            await expect(page.locator('input[type="email"]').first()).toBeVisible({
              timeout: 15_000,
            });
          } else {
            await expect(page.locator('main').first()).toBeVisible({
              timeout: 15_000,
            });
          }
        } else if (path === '/documents') {
          await expect(page).toHaveURL(/\/documents/);
          await expect(page.locator('main').first()).toBeVisible({
            timeout: 15_000,
          });
        } else if (path === '/login') {
          await expect(page.locator('input[type="email"]').first()).toBeVisible({
            timeout: 15_000,
          });
        }

        await assertDocumentTheme(page, theme);
        await assertNoObviousCrashOverlay(page);
      });
    }
  });
}
