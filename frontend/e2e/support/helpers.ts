import { Page, expect } from '@playwright/test';

/**
 * Login helper function
 * Performs login and waits for UI elements that indicate successful authentication
 */
export async function login(page: Page, email: string, password: string) {
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
  
  // Butona tıkla ve form submit'i bekle
  await page.click('button[type="submit"]');
  
  // Login işleminin tamamlanmasını bekle (hem başarılı hem başarısız durumlar için)
  await page.waitForTimeout(3000); // NextAuth işleminin tamamlanması için yeterli süre
  
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
      const errorElement = page.locator(selector).filter({ 
        hasText: /CredentialsSignin|Invalid credentials|Geçersiz|Giriş yapılamadı|Login failed|error|hata|failed|başarısız/i 
      }).first();
      
      const isVisible = await errorElement.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        const messageText = await errorElement.textContent().catch(() => '') || '';
        
        // Başarı mesajlarını ignore et - bunlar hata değil!
        const isSuccessMessage = /başarılı|success|başarıyla|successfully/i.test(messageText);
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
    console.error(`\n[E2E Login Error] ==========================================`);
    console.error(`[E2E Login Error] Email: ${email}`);
    console.error(`[E2E Login Error] Error Message: ${errorMessage || 'CredentialsSignin error'}`);
    console.error(`[E2E Login Error] Current URL: ${page.url()}`);
    console.error(`[E2E Login Error] Page Title: ${await page.title()}`);
    
    // Sayfanın HTML içeriğini kontrol et (debugging için)
    try {
      const pageContent = await page.content();
      const hasErrorText = pageContent.includes('CredentialsSignin') || pageContent.includes('Invalid');
      console.error(`[E2E Login Error] Page contains error text: ${hasErrorText}`);
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
    
    console.error(`[E2E Login Error] ==========================================\n`);
    
    throw new Error(`Login failed: ${errorMessage || 'CredentialsSignin error'}. Please verify:\n1. User exists in database: ${email}\n2. Password is correct: ${password ? '***' : 'not provided'}\n3. Backend API is accessible at ${process.env.BACKEND_API_URL || 'http://localhost:8000'}`);
  }
  
  // Wait for URL to change from /login to home page (/)
  // This is the most reliable way to verify successful login
  try {
    await page.waitForURL(url => url.pathname === '/' || url.pathname === '', { timeout: 15000 });
  } catch {
    // If URL didn't change, check if we're still on login page
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
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
          const lateErrorElement = page.locator(selector).filter({ 
            hasText: /CredentialsSignin|Invalid credentials|Geçersiz|Giriş yapılamadı|error|hata|failed|başarısız/i 
          }).first();
          
          const isVisible = await lateErrorElement.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            const messageText = await lateErrorElement.textContent().catch(() => '') || '';
            
            // Başarı mesajlarını ignore et - bunlar hata değil!
            const isSuccessMessage = /başarılı|success|başarıyla|successfully/i.test(messageText);
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
        throw new Error(`Login failed: ${lateErrorText || 'CredentialsSignin error'}`);
      }
      
      // URL değişmedi ve hata popup da yok - muhtemelen form hala görünür
      const formStillVisible = await emailInput.isVisible({ timeout: 1000 }).catch(() => false);
      if (formStillVisible) {
        throw new Error(`Login failed: Still on login page after submission. User ${email} may not exist or credentials are incorrect.`);
      }
      
      throw new Error('Login failed: Still on login page after submission - no error popup found');
    }
    // If we're on a different page, assume login succeeded
  }
  
  // Additional verification: Wait for authenticated user content to appear
  // This ensures the page is fully loaded and user session is active
  const possibleTexts = ['İstatistiklerim', 'Genel Bakış', 'My Stats', 'Global Stats'];
  let found = false;
  for (const text of possibleTexts) {
    try {
      await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10000 });
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
      return;
    }
    throw new Error('Login verification failed: Stats title not found and still on login page');
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
  // Logout butonunu bul ve tıkla - daha sağlam selector kullan
  // Önce role-based selector dene, sonra fallback olarak text-based selector kullan
  let logoutButton;
  
  try {
    // Role-based selector (daha güvenilir)
    logoutButton = page.getByRole('button', { name: /çıkış|logout|sign out/i });
    await logoutButton.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // Fallback: Text-based selector (responsive tasarım nedeniyle hamburger menü içinde olabilir)
    logoutButton = page.locator('button, a').filter({ hasText: /Logout|Çıkış|Sign Out/i });
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
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 10000 });
  }
  
  // Login sayfasının yüklendiğini doğrula
  await page.waitForLoadState('domcontentloaded');
  
  // URL kontrolü - esnek: login sayfası veya ana sayfa olabilir (logout sonrası redirect)
  const currentUrl = page.url();
  if (!currentUrl.includes('/login') && !currentUrl.match(/^https?:\/\/[^\/]+\/?$/)) {
    // Ana sayfa değilse ve login sayfası da değilse hata ver
    throw new Error(`Logout failed: Expected to be on /login page or home page, but current URL is ${currentUrl}`);
  }
}
