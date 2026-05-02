import { Page, expect } from '@playwright/test';
import { proUser, type E2ETestUser } from '../fixtures/test-data';

type LoginOptions = {
  seedUser?: boolean;
  requirePro?: boolean;
  username?: string;
};

const defaultBackendUrl =
  process.env.BACKEND_API_URL || 'http://localhost:8000';

export function isMobileViewport(page: Page): boolean {
  const width = page.viewportSize()?.width ?? 1280;
  return width < 1024;
}

export async function openMobileMenuIfNeeded(page: Page): Promise<void> {
  if (!isMobileViewport(page)) return;

  const logoutVisible = await page
    .getByRole('button', { name: /çıkış|logout|sign out/i })
    .first()
    .isVisible()
    .catch(() => false);
  if (logoutVisible) return;

  const menuBtn = page
    .getByRole('button', { name: /Menüyü aç|Open menu/i })
    .first();
  if (!(await menuBtn.isVisible().catch(() => false))) return;

  await menuBtn.click();

  // NavBar mobil drawer'ı (lg:hidden panel) veya geniş ekranda ClientPdfPanel aside'ı boyanana kadar bekle.
  await page.waitForFunction(
    () => {
      const aside = document.querySelector('aside.w-80');
      if (aside) {
        const s = getComputedStyle(aside);
        if (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          (aside as HTMLElement).offsetParent !== null
        ) {
          return true;
        }
      }
      const mobileNavPanel = document.querySelector(
        'header div[class*="lg:hidden"][class*="border-t"]'
      );
      if (!mobileNavPanel) return false;
      const ps = getComputedStyle(mobileNavPanel as HTMLElement);
      return (
        ps.display !== 'none' &&
        ps.visibility !== 'hidden' &&
        (mobileNavPanel as HTMLElement).offsetParent !== null
      );
    },
    { timeout: 10_000 }
  );
}

/** Global chat FAB overlay merge butonunu kapatıyorsa E2E için geçici gizle */
export async function dismissFabIfPresent(page: Page): Promise<void> {
  const fab = page.locator('.fixed.bottom-6.right-6').first();
  if (await fab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.addStyleTag({
      content: '.fixed.bottom-6.right-6 { display: none !important; }',
    });
  }
}

function resolveOtpCodeForEmail(email: string): string | null {
  const normalized = email
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  const scopedKey = `E2E_OTP_CODE_${normalized}`;
  const scopedValue = process.env[scopedKey]?.trim();
  if (scopedValue) return scopedValue;

  const genericValue = process.env.E2E_OTP_CODE?.trim();
  if (genericValue) return genericValue;

  return null;
}

async function ensureUserSeeded(page: Page, user: E2ETestUser): Promise<void> {
  // Önce login ile kullanıcı var mı kontrol et; 429 olursa exponential backoff ile retry et.
  const maxSeedAttempts = 4;
  let loginRes = await page.request.post(`${defaultBackendUrl}/auth/login`, {
    data: { email: user.email, password: user.password },
    failOnStatusCode: false,
  });
  for (
    let attempt = 0;
    loginRes.status() === 429 && attempt < maxSeedAttempts - 1;
    attempt += 1
  ) {
    const delayMs = Math.pow(2, attempt) * 1000;
    console.warn(`429 alındı, bekleniyor... (${delayMs}ms) user=${user.email}`);
    await page.waitForTimeout(delayMs);
    loginRes = await page.request.post(`${defaultBackendUrl}/auth/login`, {
      data: { email: user.email, password: user.password },
      failOnStatusCode: false,
    });
  }

  if (loginRes.ok()) {
    try {
      const body = await loginRes.json();
      if (body?.status === 'requires_2fa' || body?.access_token) {
        return;
      }
    } catch {
      return;
    }
    return;
  }
  if (loginRes.status() !== 401) {
    const body = await loginRes.text().catch(() => '');
    throw new Error(
      `E2E seed check failed for ${user.email}. /auth/login status=${loginRes.status()} body=${body}`
    );
  }

  const registerRes = await page.request.post(
    `${defaultBackendUrl}/auth/register`,
    {
      data: {
        username: user.username,
        email: user.email,
        password: user.password,
        eula_accepted: true,
      },
      failOnStatusCode: false,
    }
  );

  // 400 "email already taken" gibi durumlar user'ın var olduğunu gösterebilir; yeniden login deneriz.
  if (!registerRes.ok() && registerRes.status() !== 400) {
    const body = await registerRes.text().catch(() => '');
    throw new Error(
      `E2E register failed for ${user.email}. /auth/register status=${registerRes.status()} body=${body}`
    );
  }

  let verifyLogin = await page.request.post(`${defaultBackendUrl}/auth/login`, {
    data: { email: user.email, password: user.password },
    failOnStatusCode: false,
  });
  for (
    let attempt = 0;
    verifyLogin.status() === 429 && attempt < maxSeedAttempts - 1;
    attempt += 1
  ) {
    const delayMs = Math.pow(2, attempt) * 1000;
    console.warn(
      `429 alındı, bekleniyor... (${delayMs}ms) verify user=${user.email}`
    );
    await page.waitForTimeout(delayMs);
    verifyLogin = await page.request.post(`${defaultBackendUrl}/auth/login`, {
      data: { email: user.email, password: user.password },
      failOnStatusCode: false,
    });
  }
  if (!verifyLogin.ok()) {
    const body = await verifyLogin.text().catch(() => '');
    throw new Error(
      `E2E seeded user login failed for ${user.email}. status=${verifyLogin.status()} body=${body}`
    );
  }
  try {
    const j = await verifyLogin.json();
    if (j?.status === 'requires_2fa') {
      return;
    }
  } catch {
    /* ok */
  }
}

async function assertCurrentUserRole(
  page: Page,
  expectedRole: 'Pro'
): Promise<void> {
  const deadlineMs = Date.now() + 30_000;
  let lastRole: string | null = null;

  // DB/servis geç tepki verdiği durumlarda role check'i kısa bir süre içinde retry'liyoruz.
  while (Date.now() < deadlineMs) {
    const roleResp = await page.evaluate(async () => {
      try {
        // NextAuth session endpoint'i erişim token'ını verir.
        const sessionRes = await fetch('/api/auth/session', {
          credentials: 'include',
        });
        const session = sessionRes.ok ? await sessionRes.json() : null;

        const token =
          (session as any)?.accessToken ??
          (session as any)?.apiToken ??
          (session as any)?.user?.accessToken ??
          (session as any)?.user?.apiToken ??
          null;

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/files/user/stats', {
          credentials: 'include',
          headers,
        });

        if (!res.ok) return { ok: false, status: res.status, role: null };
        const data = await res.json();
        return { ok: true, status: 200, role: data?.role ?? null };
      } catch {
        return { ok: false, status: 0, role: null };
      }
    });

    if (roleResp.ok && roleResp.role === expectedRole) return;
    lastRole = roleResp.role ?? null;

    // 503/401 gibi durumlarda hemen tekrar deniyoruz.
    await page.waitForTimeout(1000);
  }

  throw new Error(
    `E2E role precondition failed. Expected ${expectedRole}, got ${lastRole ?? 'unknown'}. ` +
      `User may not be seeded with correct role or auth token may not be ready yet.`
  );
}

/**
 * Login helper function
 * Performs login and waits for UI elements that indicate successful authentication
 */
export async function login(
  page: Page,
  email: string = proUser.email,
  password: string = proUser.password,
  options: LoginOptions = {}
) {
  const username =
    options.username || email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
  const user: E2ETestUser = { email, password, username };

  const seedUserEnabledByEnv =
    (process.env.E2E_SEED_USER || 'true').toLowerCase() !== 'false';
  if (options.seedUser !== false && seedUserEnabledByEnv) {
    await ensureUserSeeded(page, user);
  }

  // Docker bazen ilk login isteğinde yavaş kalabiliyor - kısa bir bekleme ekle
  await page.waitForTimeout(1000);

  // Navigate to login page
  await page.goto('/login', { waitUntil: 'networkidle' });

  // NextAuth Docker üzerinde tam hazır olsun diye bekle
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Wait for the page to be fully loaded and email input to be visible
  // Use a more robust selector that waits for the form to be ready
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });

  // Fill in the form
  await emailInput.fill(email);
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(password);

  // Mobilde click flaky olabildiği için formu Enter ile doğal şekilde submit et.
  const submitButton = page.locator('button[type="submit"]').first();
  await passwordInput.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);

  const otpSlot = page.locator('[data-slot="input-otp-slot"]').first();
  await page.waitForTimeout(250);
  const otpAppearedQuickly = await otpSlot
    .isVisible({ timeout: 1500 })
    .catch(() => false);

  if (!otpAppearedQuickly) {
    await page
      .waitForURL(
        (url) =>
          /\/($|dashboard|upload|chat|summarize-pdf|profile)/.test(
            url.pathname
          ),
        { timeout: 10000 }
      )
      .catch(async () => {
        if (page.url().includes('/login')) {
          await passwordInput.focus().catch(() => {});
          await page.keyboard.press('Enter').catch(() => {});
          await page
            .waitForURL(
              (url) =>
                /\/($|dashboard|upload|chat|summarize-pdf|profile)/.test(
                  url.pathname
                ),
              { timeout: 10000 }
            )
            .catch(() => {});
        }
      });
  }

  const otpStepVisible = await otpSlot
    .waitFor({ state: 'visible', timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  if (otpStepVisible) {
    const code = resolveOtpCodeForEmail(email);
    if (!code) {
      throw new Error(
        `OTP step detected for ${email} but no OTP code is configured. ` +
          `Set E2E_OTP_CODE or E2E_OTP_CODE_${email
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')} in your environment.`
      );
    }
    // Klavye simülasyonu flaky olabildiği için gizli gerçek OTP input'una force fill uygula.
    const hiddenOtpInput = page
      .locator(
        'input[autocomplete="one-time-code"], input[data-input-otp="true"]'
      )
      .first();
    await hiddenOtpInput.waitFor({ state: 'attached', timeout: 10000 });
    await hiddenOtpInput.fill(code, { force: true });

    const verifyButton = page
      .getByRole('button', {
        name: /Doğrula|Verify|Submit|giriş yap|sign in/i,
      })
      .first();
    await expect(verifyButton).toBeEnabled({ timeout: 10000 });
    await hiddenOtpInput.focus();
    await page.keyboard.press('Enter');

    await page
      .waitForURL(
        (url) =>
          /\/($|dashboard|upload|chat|summarize-pdf|profile)/.test(
            url.pathname
          ),
        { timeout: 15000 }
      )
      .catch(() => {});
  }

  // Race condition kalkanı: login sonrası yönlendirme veya auth UI kesinleşsin.
  await Promise.race([
    page.waitForURL(
      (url) =>
        /\/($|dashboard|upload|chat|summarize-pdf|profile)/.test(url.pathname),
      { timeout: 15000 }
    ),
    expect(
      page
        .getByRole('button', { name: /Çıkış|Logout|Profilim|My Profile/i })
        .first()
    ).toBeVisible({ timeout: 15000 }),
  ]).catch(() => {
    // Mevcut detaylı fallback kontrolleri (aşağıdaki bloklar) devreye girecek.
  });

  // Sabit 3s yerine uygulama rotasına yerleşmeyi bekle (webkit dahil deterministik)
  await page
    .waitForURL(
      (url) =>
        /\/($|dashboard|upload|home|chat|summarize-pdf|profile)/.test(
          url.pathname
        ),
      { timeout: 15_000 }
    )
    .catch(() => {});

  // Önce hata popup'ını kontrol et (Popup component .fixed.top-6.right-6 ve border-red-500 kullanıyor)
  // SADECE gerçek hata mesajlarını yakala - başarı mesajlarını ignore et
  const errorSelectors = [
    '.fixed.top-6.right-6', // Popup component
    '[role="alert"]',
    '.border-red-500', // Error popup'ın border class'ı (kırmızı border = hata)
  ];

  // Tüm olası hata popup'larını kontrol et
  let hasError = false;
  let errorMessage = '';

  for (const selector of errorSelectors) {
    try {
      // Sadece kırmızı renkli (error) popup'ları veya hata kelimeleri içeren mesajları yakala
      const errorElement = page
        .locator(selector)
        .filter({
          hasText:
            /CredentialsSignin|Invalid credentials|Geçersiz|Giriş yapılamadı|Login failed|Kod geçersiz|Invalid or expired code|error|hata|failed|başarısız/i,
        })
        .first();

      const isVisible = await errorElement
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (isVisible) {
        const messageText =
          (await errorElement.textContent().catch(() => '')) || '';

        // Başarı mesajlarını ignore et - bunlar hata değil!
        const isSuccessMessage =
          /başarılı|success|başarıyla|successfully/i.test(messageText);
        if (!isSuccessMessage) {
          hasError = true;
          errorMessage = messageText;
          break;
        }
      }
    } catch {
      continue;
    }
  }

  if (hasError) {
    // Log detailed error information for debugging
    console.error(
      `\n[E2E Login Error] ==========================================`
    );
    console.error(`[E2E Login Error] Email: ${email}`);
    console.error(
      `[E2E Login Error] Error Message: ${errorMessage || 'CredentialsSignin error'}`
    );
    console.error(`[E2E Login Error] Current URL: ${page.url()}`);
    console.error(`[E2E Login Error] Page Title: ${await page.title()}`);

    // Sayfanın HTML içeriğini kontrol et (debugging için)
    try {
      const pageContent = await page.content();
      const hasErrorText =
        pageContent.includes('CredentialsSignin') ||
        pageContent.includes('Invalid');
      console.error(
        `[E2E Login Error] Page contains error text: ${hasErrorText}`
      );
    } catch {
      // Content hatası önemli değil
    }

    // Screenshot al (debugging için)
    try {
      const screenshotPath = `test-results/login-error-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`[E2E Login Error] Screenshot saved: ${screenshotPath}`);
    } catch {
      // Screenshot hatası önemli değil
    }

    console.error(
      `[E2E Login Error] ==========================================\n`
    );

    throw new Error(
      `Login failed: ${errorMessage || 'CredentialsSignin error'}. Please verify:\n1. User exists in database: ${email}\n2. Password is correct: ${password ? '***' : 'not provided'}\n3. Backend API is accessible at ${process.env.BACKEND_API_URL || 'http://localhost:8000'}`
    );
  }

  // Wait for URL to change from /login to home page (/)
  // This is the most reliable way to verify successful login
  try {
    await page.waitForURL(
      (url) =>
        /\/($|dashboard|upload|chat|summarize-pdf|profile)/.test(url.pathname),
      {
        timeout: 30000,
      }
    );
    // Redirect sonrası ağ isteklerinin tamamlanmasını bekle.
    await page.waitForLoadState('networkidle');
  } catch {
    // If URL didn't change, check if we're still on login page
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      // Bazı koşullarda login başarılı toast'ı geliyor ama redirect gecikiyor.
      const successSignals = [
        page
          .locator('.fixed.top-6.right-6')
          .filter({ hasText: /giriş başarılı|login successful|başarılı/i })
          .first(),
        page
          .getByRole('button', { name: /Çıkış|Logout|Profilim|My Profile/i })
          .first(),
      ];
      for (const signal of successSignals) {
        const ok = await signal.isVisible({ timeout: 1500 }).catch(() => false);
        if (ok) {
          await page
            .goto('/', { waitUntil: 'networkidle', timeout: 15000 })
            .catch(() => {});
          await page.waitForLoadState('domcontentloaded');
          break;
        }
      }

      if (!page.url().includes('/login')) {
        await page.waitForLoadState('networkidle').catch(() => {});
        // redirect/attach sonrası çık
        if (options.requirePro) {
          await assertCurrentUserRole(page, 'Pro');
        }
        return;
      }

      // Tekrar hata popup kontrolü yap (bazen geç görünebilir)
      // SADECE gerçek hata mesajlarını yakala - başarı mesajlarını ignore et
      const lateErrorSelectors = [
        '.fixed.top-6.right-6',
        '[role="alert"]',
        '.border-red-500', // Kırmızı border = hata
      ];

      let hasLateError = false;
      let lateErrorText = '';

      for (const selector of lateErrorSelectors) {
        try {
          const lateErrorElement = page
            .locator(selector)
            .filter({
              hasText:
                /CredentialsSignin|Invalid credentials|Geçersiz|Giriş yapılamadı|error|hata|failed|başarısız/i,
            })
            .first();

          const isVisible = await lateErrorElement
            .isVisible({ timeout: 2000 })
            .catch(() => false);
          if (isVisible) {
            const messageText =
              (await lateErrorElement.textContent().catch(() => '')) || '';

            // Başarı mesajlarını ignore et - bunlar hata değil!
            const isSuccessMessage =
              /başarılı|success|başarıyla|successfully/i.test(messageText);
            if (!isSuccessMessage) {
              hasLateError = true;
              lateErrorText = messageText;
              break;
            }
          }
        } catch {
          continue;
        }
      }

      if (hasLateError) {
        throw new Error(
          `Login failed: ${lateErrorText || 'CredentialsSignin error'}`
        );
      }

      // URL değişmedi ve hata popup da yok - muhtemelen form hala görünür
      const formStillVisible = await emailInput
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (formStillVisible) {
        // Bir kez daha submit deneyip redirect'in oturmasını bekle (NextAuth gecikme flake kalkanı)
        await page.click('button[type="submit"]').catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        await page
          .waitForURL(
            (url) =>
              /\/($|dashboard|upload|chat|summarize-pdf|profile)/.test(
                url.pathname
              ),
            {
              timeout: 8000,
            }
          )
          .catch(() => {});
        if (!page.url().includes('/login')) return;
        throw new Error(
          `Login failed: Still on login page after submission. User ${email} may not exist or credentials are incorrect.`
        );
      }

      throw new Error(
        'Login failed: Still on login page after submission - no error popup found'
      );
    }
    // If we're on a different page, assume login succeeded
    await page.waitForLoadState('networkidle');
  }

  // Additional verification: Wait for authenticated user content to appear
  // This ensures the page is fully loaded and user session is active
  const possibleTexts = [
    'İstatistiklerim',
    'Genel Bakış',
    'My Stats',
    'Global Stats',
  ];
  let found = false;
  for (const text of possibleTexts) {
    try {
      await expect(page.locator(`text=${text}`).first()).toBeVisible({
        timeout: 10000,
      });
      found = true;
      break;
    } catch {
      continue;
    }
  }

  // If stats text not found but URL changed, login likely succeeded
  // (Some pages might not show stats immediately)
  if (!found) {
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      // URL changed, login succeeded even if stats text not visible
      // React hydrate / kritik UI attach guard
      await Promise.race([
        page
          .getByRole('button', {
            name: /Yeni Sohbet|New Chat|Çıkış|Logout|Profilim|My Profile/i,
          })
          .first()
          .waitFor({ state: 'attached', timeout: 15000 }),
        page.locator('body').waitFor({ state: 'attached', timeout: 15000 }),
      ]).catch(() => {});
      return;
    }
    throw new Error(
      'Login verification failed: Stats title not found and still on login page'
    );
  }

  // React hydrate / kritik UI attach guard
  await Promise.race([
    page
      .getByRole('button', {
        name: /Yeni Sohbet|New Chat|Çıkış|Logout|Profilim|My Profile/i,
      })
      .first()
      .waitFor({ state: 'attached', timeout: 15000 }),
    page.locator('body').waitFor({ state: 'attached', timeout: 15000 }),
  ]).catch(() => {});

  if (options.requirePro) {
    await assertCurrentUserRole(page, 'Pro');
  }
}

/**
 * Navigate to a specific path
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Logout helper function
 * Fedora'daki yönlendirme yavaşlığını baypas etmek için manuel yönlendirme kullanıyoruz
 */
export async function logout(page: Page) {
  await openMobileMenuIfNeeded(page);

  // Logout butonunu bul ve tıkla - daha sağlam selector kullan
  // Önce role-based selector dene, sonra fallback olarak text-based selector kullan
  let logoutButton;

  try {
    // Role-based selector (daha güvenilir)
    logoutButton = page.getByRole('button', { name: /çıkış|logout|sign out/i });
    await logoutButton.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // Fallback: Text-based selector (responsive tasarım nedeniyle hamburger menü içinde olabilir)
    logoutButton = page
      .locator('button, a')
      .filter({ hasText: /Logout|Çıkış|Sign Out/i });
    await logoutButton.first().waitFor({ state: 'visible', timeout: 5000 });
  }

  // Butona tıkla
  await logoutButton.first().click();

  // NextAuth'un logout işlemini tamamlaması için kısa bir bekleme
  await page.waitForTimeout(1000);

  // Fedora'daki yönlendirme yavaşlığını baypas et: Manuel olarak login sayfasına yönlendir
  try {
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 15000 });
  } catch {
    // Eğer goto başarısız olursa, URL'in zaten login sayfası olup olmadığını kontrol et
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      // Zaten login sayfasındayız, devam et
      return;
    }
    // Değilse tekrar dene
    await page.goto('/login', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
  }

  // Login sayfasının yüklendiğini doğrula
  await page.waitForLoadState('domcontentloaded');

  // URL kontrolü - esnek: login sayfası veya ana sayfa olabilir (logout sonrası redirect)
  const currentUrl = page.url();
  if (
    !currentUrl.includes('/login') &&
    !currentUrl.match(/^https?:\/\/[^\/]+\/?$/)
  ) {
    // Ana sayfa değilse ve login sayfası da değilse hata ver
    throw new Error(
      `Logout failed: Expected to be on /login page or home page, but current URL is ${currentUrl}`
    );
  }
}
