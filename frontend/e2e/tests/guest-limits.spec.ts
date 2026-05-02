import { test, expect } from '@playwright/test';
import path from 'path';
import { guestUsageLimit } from '../fixtures/test-data';
import {
  dismissFabIfPresent,
  isMobileViewport,
  openMobileMenuIfNeeded,
} from '../support/helpers';

test.describe('Guest limits E2E', () => {
  test('guest sees usage limit modal after limit and is redirected to login', async ({
    page,
    request,
  }) => {
    await page.context().clearCookies();

    const sessionRes = await request.post('/guest/session');
    expect(sessionRes.ok()).toBeTruthy();
    const sessionData = await sessionRes.json();
    const guestId = String(sessionData?.guest_id || '').trim();
    expect(guestId.length).toBeGreaterThan(0);

    // Backend'deki gerçek tavan ile aynı sayıda /guest/use (env'deki E2E_GUEST_MAX_USAGE yetersiz kalabilir).
    const maxUsage = Number(sessionData?.max_usage ?? guestUsageLimit);
    expect(maxUsage).toBeGreaterThan(0);

    for (let i = 0; i < maxUsage; i++) {
      const useRes = await request.post('/guest/use', {
        headers: { 'X-Guest-ID': guestId },
      });
      expect([200, 403]).toContain(useRes.status());
    }

    const exhaustedRes = await request.get('/guest/check-usage', {
      headers: { 'X-Guest-ID': guestId },
    });
    expect(exhaustedRes.ok()).toBeTruthy();
    const exhaustedBody = await exhaustedRes.json();
    expect(exhaustedBody.can_use).toBe(false);

    await page.addInitScript((id) => {
      window.localStorage.setItem('guest_id', id);
    }, guestId);

    if (isMobileViewport(page)) {
      await openMobileMenuIfNeeded(page);
    }
    const mergeNavLink = page.locator('a[href="/merge-pdf"]').first();
    if (await mergeNavLink.isVisible().catch(() => false)) {
      await mergeNavLink.click();
    } else {
      await page.goto('/merge-pdf');
    }
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/merge-pdf/);

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    await fileInput.setInputFiles([pdfPath, pdfPath]);
    await expect(page.getByText(/sample\.pdf/i).first()).toBeVisible({
      timeout: 10000,
    });

    const mergeButton = page
      .getByRole('button', { name: /Birleştir|Merge/i })
      .first();
    await expect(mergeButton).toBeVisible({ timeout: 10000 });
    await mergeButton.scrollIntoViewIfNeeded();
    await dismissFabIfPresent(page);
    await mergeButton.click();

    const modalTitle = page
      .getByText(/Kullanım Limitine Ulaştınız|Pro Üyelik Gerekli/i)
      .first();
    await expect(modalTitle).toBeVisible({ timeout: 15000 });

    const loginButton = page
      .getByTestId('usage-limit-modal')
      .getByRole('button', { name: /Giriş Yap|Login/i });
    await expect(loginButton).toBeVisible({ timeout: 5000 });
    await loginButton.click();

    await expect(page).toHaveURL(/.*login/, { timeout: 15000 });
  });
});
