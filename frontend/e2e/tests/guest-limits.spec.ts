import { test, expect } from '@playwright/test';
import path from 'path';
import { guestUsageLimit } from '../fixtures/test-data';

test.describe('Guest limits E2E', () => {
  test('guest sees usage limit modal after limit and is redirected to login', async ({
    page,
    request,
  }) => {
    const sessionRes = await request.post('/guest/session');
    expect(sessionRes.ok()).toBeTruthy();
    const sessionData = await sessionRes.json();
    const guestId = String(sessionData?.guest_id || '').trim();
    expect(guestId.length).toBeGreaterThan(0);

    // Test state'ini deterministic hale getirmek için guest limitini API ile doldur.
    for (let i = 0; i < guestUsageLimit; i++) {
      const useRes = await request.post('/guest/use', {
        headers: { 'X-Guest-ID': guestId },
      });
      expect([200, 403]).toContain(useRes.status());
    }

    await page.addInitScript((id) => {
      window.localStorage.setItem('guest_id', id);
    }, guestId);

    await page.goto('/merge-pdf');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page
        .locator('text=/mergePageTitle|Birleştir|Merge|PDF Birleştirici/i')
        .first()
    ).toBeVisible({ timeout: 10000 });

    const pdfPath = path.join(__dirname, '../fixtures/sample.pdf');
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });

    await fileInput.setInputFiles([pdfPath, pdfPath]);
    await expect(page.locator('ul.container-card li').first()).toBeVisible({
      timeout: 10000,
    });

    const mergeButton = page
      .locator('button')
      .filter({ hasText: /mergeButton|Birleştir|Merge PDFs/i })
      .first();
    await mergeButton.click();

    const modalTitle = page
      .getByText(/Kullanım Limitine Ulaştınız|Pro Üyelik Gerekli/i)
      .first();
    await expect(modalTitle).toBeVisible({ timeout: 10000 });

    const loginButton = page.getByRole('button', { name: /Giriş Yap|Login/i });
    await expect(loginButton).toBeVisible({ timeout: 5000 });
    await loginButton.click();

    await expect(page).toHaveURL(/.*login/, { timeout: 15000 });
  });
});
