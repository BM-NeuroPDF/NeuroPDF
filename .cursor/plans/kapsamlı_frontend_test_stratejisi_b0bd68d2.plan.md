---
name: Kapsamlı Frontend Test Stratejisi
overview: "Next.js + React + TypeScript projesi için kapsamlı test stratejisi: Unit testler (UI bileşenleri, hooks, utils), State Management testleri (Context API), Integration testler (MSW ile API mocking), ve E2E testler (Playwright ile kullanıcı akışları). Mevcut test yapısını genişletip eksik testleri ekleyeceğiz."
todos:
  - id: setup-msw
    content: MSW setup ve handlers oluştur (setup.ts, handlers.ts)
    status: pending
  - id: update-vitest-setup
    content: vitest.setup.ts dosyasına MSW server başlatma ekle
    status: pending
    dependencies:
      - setup-msw
  - id: context-tests
    content: Context API testleri yaz (PdfContext, LanguageContext, PopupContext)
    status: pending
  - id: component-unit-tests
    content: Component unit testleri yaz (NavBar, AuthBar, Popup, UsageLimitModal, LanguageSwitcher)
    status: pending
  - id: service-tests
    content: Service testleri yaz (pdfService, guestService)
    status: pending
  - id: integration-tests
    content: Integration testleri yaz (PDF operations, Chat, Pages)
    status: pending
    dependencies:
      - setup-msw
      - update-vitest-setup
  - id: e2e-helpers
    content: E2E helper fonksiyonlarını genişlet (uploadPdfFile, waitForApiResponse)
    status: pending
  - id: e2e-pdf-tests
    content: E2E PDF testleri yaz (upload, summarize, chat, merge)
    status: pending
    dependencies:
      - e2e-helpers
  - id: e2e-guest-tests
    content: E2E guest limit testleri yaz
    status: pending
    dependencies:
      - e2e-helpers
  - id: update-configs
    content: Test konfigürasyonlarını güncelle (vitest.config.ts, package.json scripts)
    status: pending
  - id: todo-1773571562762-jyfi2up2h
    content: |-
      Sen NeuroPDF projesinde Kıdemli bir Frontend Test ve QA Mühendisisin. 
      Şu ana kadar Phase 1 (MSW Setup), Phase 2 (Context Tests) ve Phase 3 (Unit Tests) adımlarını %100 başarıyla tamamladık.

      Şimdi seninle "Phase 4: Integration Tests (Sayfa ve Akış)" adımına geçiyoruz. Aşağıda bu fazda yapmamız gerekenlerin listesi bulunuyor. Lütfen hepsini aynı anda yapmaya çalışma! Sadece ilk görevden başla.

      **GÖREV 1: PDF Operations Entegrasyon Testi (`pdf-operations.test.tsx`)**
      Lütfen `src/__tests__/integration/pdf-operations.test.tsx` dosyasını oluştur.
      Bu dosyada, kullanıcının `UploadPage` bileşenini kullanarak sisteme bir PDF yüklemesini, MSW (Mock Service Worker) üzerinden API isteğinin başarıyla tamamlanmasını ve yükleme sonrası ekranda "PDF Loaded" (veya ilgili çevirisi/metni) ibaresinin görünmesini test eden bir senaryo yaz. 
      *Not: Testleri yazarken DOM etkileşimleri için `@testing-library/user-event` kullanmayı unutma.*

      (Eğer bu testi bitirip çalıştırırsan, bana bilgi ver. Ben onayladıktan sonra Chat veya Summarize entegrasyon testlerine geçeceğiz.)

      --- REFERANS İÇİN MASTER PLANIN PHASE 4 KISMI ---

      3. Integration Testleri (MSW ile API Mocking)
      3.2 PDF Operations Integration Tests
      Dosya: src/__tests__/integration/pdf-operations.test.tsx
      * PDF upload → backend API çağrısı
      * Upload progress tracking
      * Error handling (file too large, invalid type)
      * Success response handling

      3.3 Chat Integration Tests
      Dosya: src/__tests__/integration/chat-integration.test.tsx
      * Chat session başlatma
      * Mesaj gönderme
      * Streaming response handling
      * Session ID yönetimi
      * Error recovery

      3.4 Page-Level Integration Tests
      Dosya: src/__tests__/integration/pages/UploadPage.test.tsx
      * File drop functionality
      * Upload button click
      * PDF viewer rendering
      * Chat panel integration
      * Guest limit modal
    status: pending
---

# Kapsamlı Frontend Test Stratejisi

## Mevcut Durum Analizi

Projede şu testler mevcut:

- ✅ Unit testler: `PdfChatPanel`, `PdfViewer`, `ProGlobalChat`, hooks (`useGuestLimit`, `usePopup`), utils (`api`)
- ✅ E2E testler: `auth.spec.ts`, `profile.spec.ts`
- ⚠️ Integration testler: Dokümantasyonda bahsedilmiş ama dosyalar eksik
- ⚠️ State Management testleri: Context API için testler yok 

## Test Klasör Yapısı

```
frontend/
├── src/
│   ├── __tests__/
│   │   ├── integration/              # Integration testler
│   │   │   ├── setup.ts              # MSW server setup
│   │   │   ├── handlers.ts           # API mock handlers
│   │   │   ├── pdf-operations.test.tsx
│   │   │   ├── chat-integration.test.tsx
│   │   │   ├── auth-integration.test.tsx
│   │   │   └── pages/
│   │   │       ├── UploadPage.test.tsx
│   │   │       ├── SummarizePage.test.tsx
│   │   │       └── MergePage.test.tsx
│   │   └── unit/
│   │       ├── components/           # Component unit testleri
│   │       │   ├── NavBar.test.tsx
│   │       │   ├── AuthBar.test.tsx
│   │       │   ├── Popup.test.tsx
│   │       │   ├── UsageLimitModal.test.tsx
│   │       │   └── LanguageSwitcher.test.tsx
│   │       ├── context/              # Context API testleri
│   │       │   ├── PdfContext.test.tsx
│   │       │   ├── LanguageContext.test.tsx
│   │       │   └── PopupContext.test.tsx
│   │       └── services/            # Service testleri
│   │           ├── pdfService.test.ts
│   │           └── guestService.test.ts
│   ├── components/__tests__/        # Mevcut component testleri
│   ├── hooks/__tests__/              # Mevcut hook testleri
│   └── utils/__tests__/              # Mevcut util testleri
├── e2e/
│   ├── tests/
│   │   ├── auth.spec.ts              # Mevcut
│   │   ├── profile.spec.ts          # Mevcut
│   │   ├── pdf-upload.spec.ts       # YENİ: PDF yükleme akışı
│   │   ├── pdf-summarize.spec.ts    # YENİ: PDF özetleme akışı
│   │   ├── pdf-chat.spec.ts        # YENİ: PDF chat akışı
│   │   ├── pdf-merge.spec.ts        # YENİ: PDF birleştirme
│   │   └── guest-limits.spec.ts     # YENİ: Misafir limitleri
│   ├── fixtures/
│   │   └── test-data.ts             # Test verileri
│   └── support/
│       └── helpers.ts                # Mevcut helper'lar
├── vitest.config.ts                  # Mevcut
├── vitest.setup.ts                   # MSW setup eklenmeli
└── playwright.config.ts               # Mevcut
```

## 1. Unit Testler (UI Bileşenleri)

### 1.1 Component Testleri

**Dosya:** `src/__tests__/unit/components/NavBar.test.tsx`

- Navigation linklerinin render edilmesi
- Responsive menü açma/kapama
- Aktif sayfa highlight'ı
- Logout butonu işlevselliği

**Dosya:** `src/__tests__/unit/components/AuthBar.test.tsx`

- Login/Logout butonlarının görünürlüğü
- Kullanıcı bilgilerinin gösterilmesi
- Avatar gösterimi

**Dosya:** `src/__tests__/unit/components/Popup.test.tsx`

- Success, error, info popup'larının render edilmesi
- Auto-close mekanizması (3 saniye)
- Manuel close işlevi
- Multiple popup desteği

**Dosya:** `src/__tests__/unit/components/UsageLimitModal.test.tsx`

- Modal açılma/kapanma
- Limit bilgilerinin gösterilmesi
- "Login'e git" butonu işlevselliği
- Guest vs Authenticated kullanıcı farkları

**Dosya:** `src/__tests__/unit/components/LanguageSwitcher.test.tsx`

- Dil değiştirme işlevselliği
- localStorage'a kaydetme
- Çeviri fonksiyonunun çalışması

### 1.2 Form Testleri

**Dosya:** `src/__tests__/unit/components/LoginForm.test.tsx` (yeni component gerekirse)

- Email/password input validasyonu
- Submit butonu disabled/enabled durumları
- Hata mesajlarının gösterilmesi
- Başarılı login sonrası yönlendirme

## 2. State Management Testleri (Context API)

### 2.1 PdfContext Testleri

**Dosya:** `src/__tests__/unit/context/PdfContext.test.tsx`

- PDF dosyası kaydetme (`savePdf`)
- PDF temizleme (`clearPdf`)
- Session storage'a kaydetme/kurtarma
- Chat mesajları state yönetimi
- Session ID yönetimi
- `refreshKey` mekanizması

### 2.2 LanguageContext Testleri

**Dosya:** `src/__tests__/unit/context/LanguageContext.test.tsx`

- Dil değiştirme (`setLanguage`)
- localStorage'a kaydetme
- Çeviri fonksiyonu (`t`)
- Varsayılan dil (tr)
- Geçersiz dil değerleri

### 2.3 PopupContext Testleri

**Dosya:** `src/__tests__/unit/context/PopupContext.test.tsx`

- `showSuccess`, `showError`, `showInfo` fonksiyonları
- Multiple popup desteği
- Auto-remove mekanizması
- Popup ID yönetimi

## 3. Integration Testleri (MSW ile API Mocking)

### 3.1 MSW Setup

**Dosya:** `src/__tests__/integration/setup.ts`

- MSW server setup
- Common handlers (auth, errors)
- Test utilities

**Dosya:** `src/__tests__/integration/handlers.ts`

- PDF upload handler
- Summarize handler
- Chat handlers
- Merge/extract/convert handlers
- Error scenarios

**Dosya:** `vitest.setup.ts` (güncelleme)

- MSW server başlatma
- Global test utilities

### 3.2 PDF Operations Integration Tests

**Dosya:** `src/__tests__/integration/pdf-operations.test.tsx`

- PDF upload → backend API çağrısı
- Upload progress tracking
- Error handling (file too large, invalid type)
- Success response handling

**Dosya:** `src/__tests__/integration/summarize-flow.test.tsx`

- PDF upload
- Summarize API çağrısı
- Loading state
- Summary response rendering
- Error handling

### 3.3 Chat Integration Tests

**Dosya:** `src/__tests__/integration/chat-integration.test.tsx`

- Chat session başlatma
- Mesaj gönderme
- Streaming response handling
- Session ID yönetimi
- Error recovery

### 3.4 Page-Level Integration Tests

**Dosya:** `src/__tests__/integration/pages/UploadPage.test.tsx`

- File drop functionality
- Upload button click
- PDF viewer rendering
- Chat panel integration
- Guest limit modal

**Dosya:** `src/__tests__/integration/pages/SummarizePage.test.tsx`

- File upload
- Summarize button
- Summary display
- Audio generation
- Chat integration

## 4. E2E Testler (Playwright)

### 4.1 PDF Upload Flow

**Dosya:** `e2e/tests/pdf-upload.spec.ts`

```typescript
test('user can upload PDF file', async ({ page }) => {
  await login(page, TEST_EMAIL, TEST_PASSWORD)
  await page.goto('/upload')
  
  // File upload simulation
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles('test-fixtures/sample.pdf')
  
  // Wait for PDF viewer
  await expect(page.locator('.pdf-viewer')).toBeVisible()
  
  // Verify file is saved in context
  await expect(page.locator('text=PDF loaded')).toBeVisible()
})
```

### 4.2 PDF Summarize Flow

**Dosya:** `e2e/tests/pdf-summarize.spec.ts`

```typescript
test('user can summarize PDF', async ({ page }) => {
  await login(page, TEST_EMAIL, TEST_PASSWORD)
  await page.goto('/summarize-pdf')
  
  // Upload PDF
  await uploadPdfFile(page, 'test-fixtures/sample.pdf')
  
  // Click summarize button
  await page.click('button:has-text("Özetle")')
  
  // Wait for summary
  await expect(page.locator('.summary-content')).toBeVisible({ timeout: 30000 })
  
  // Verify summary text is displayed
  const summaryText = await page.locator('.summary-content').textContent()
  expect(summaryText).toBeTruthy()
  expect(summaryText.length).toBeGreaterThan(0)
})
```

### 4.3 PDF Chat Flow

**Dosya:** `e2e/tests/pdf-chat.spec.ts`

```typescript
test('user can chat with PDF', async ({ page }) => {
  await login(page, TEST_EMAIL, TEST_PASSWORD)
  await page.goto('/upload')
  
  // Upload and open chat
  await uploadPdfFile(page, 'test-fixtures/sample.pdf')
  await page.click('button:has-text("Chat")')
  
  // Wait for chat panel
  await expect(page.locator('.chat-panel')).toBeVisible()
  
  // Send message
  await page.fill('input[placeholder*="message"]', 'What is this PDF about?')
  await page.click('button[type="submit"]')
  
  // Wait for response
  await expect(page.locator('.message-assistant').last()).toBeVisible({ timeout: 30000 })
})
```

### 4.4 PDF Merge Flow

**Dosya:** `e2e/tests/pdf-merge.spec.ts`

```typescript
test('user can merge multiple PDFs', async ({ page }) => {
  await login(page, TEST_EMAIL, TEST_PASSWORD)
  await page.goto('/merge-pdf')
  
  // Upload multiple files
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([
    'test-fixtures/file1.pdf',
    'test-fixtures/file2.pdf'
  ])
  
  // Click merge button
  await page.click('button:has-text("Birleştir")')
  
  // Wait for merged PDF download
  const downloadPromise = page.waitForEvent('download')
  await downloadPromise
})
```

### 4.5 Guest Limits E2E

**Dosya:** `e2e/tests/guest-limits.spec.ts`

```typescript
test('guest user sees limit modal after max uploads', async ({ page }) => {
  await page.goto('/upload')
  
  // Upload files up to limit
  for (let i = 0; i < 3; i++) {
    await uploadPdfFile(page, 'test-fixtures/sample.pdf')
    await page.waitForTimeout(1000)
  }
  
  // Verify limit modal appears
  await expect(page.locator('.usage-limit-modal')).toBeVisible()
  
  // Click login button
  await page.click('button:has-text("Login")')
  await expect(page).toHaveURL(/\/login/)
})
```

## 5. Test Utilities ve Helpers

### 5.1 E2E Helpers Güncellemesi

**Dosya:** `e2e/support/helpers.ts` (güncelleme)

- `uploadPdfFile(page, filePath)` - PDF yükleme helper'ı
- `waitForApiResponse(page, urlPattern)` - API response bekleme
- `createTestPdf()` - Test PDF oluşturma

### 5.2 Test Fixtures

**Dosya:** `e2e/fixtures/test-data.ts` (güncelleme)

- Test PDF dosyaları yolları
- Test kullanıcı bilgileri
- API endpoint'leri
- Selector'lar

## 6. Test Konfigürasyonu Güncellemeleri

### 6.1 Vitest Config

**Dosya:** `vitest.config.ts` (güncelleme)

- MSW setup file path
- Test timeout'ları
- Coverage thresholds

### 6.2 Vitest Setup

**Dosya:** `vitest.setup.ts` (güncelleme)

- MSW server başlatma
- Global mocks
- Test utilities import

### 6.3 Package.json Scripts

**Dosya:** `package.json` (güncelleme)

```json
{
  "scripts": {
    "test:unit": "vitest run src/__tests__/unit",
    "test:integration": "vitest run src/__tests__/integration",
    "test:all": "vitest run",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

## 7. Örnek Test Kodları

### 7.1 Unit Test Örneği: Popup Component

```typescript
// src/__tests__/unit/components/Popup.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Popup from '@/components/ui/Popup'

describe('Popup', () => {
  it('renders success message', () => {
    render(<Popup type="success" message="Operation successful" open={true} onClose={vi.fn()} />)
    expect(screen.getByText('Operation successful')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('bg-green-500')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Popup type="error" message="Error occurred" open={true} onClose={onClose} />)
    screen.getByRole('button', { name: /close/i }).click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

### 7.2 Context Test Örneği: PdfContext

```typescript
// src/__tests__/unit/context/PdfContext.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { PdfProvider, usePdf } from '@/context/PdfContext'

describe('PdfContext', () => {
  it('saves PDF file to context', async () => {
    const { result } = renderHook(() => usePdf(), {
      wrapper: PdfProvider
    })

    const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    
    await act(async () => {
      await result.current.savePdf(testFile)
    })

    expect(result.current.pdfFile).toEqual(testFile)
  })

  it('clears PDF from context', async () => {
    const { result } = renderHook(() => usePdf(), {
      wrapper: PdfProvider
    })

    const testFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    await act(async () => {
      await result.current.savePdf(testFile)
    })

    act(() => {
      result.current.clearPdf()
    })

    expect(result.current.pdfFile).toBeNull()
  })
})
```

### 7.3 Integration Test Örneği: PDF Upload

```typescript
// src/__tests__/integration/pdf-operations.test.tsx
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { server } from './setup'
import { http, HttpResponse } from 'msw'
import UploadPage from '@/app/upload/page'

describe('PDF Upload Integration', () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())

  it('uploads PDF and shows viewer', async () => {
    server.use(
      http.post('http://localhost:8000/files/upload', () => {
        return HttpResponse.json({ file_id: 123, status: 'success' })
      })
    )

    render(<UploadPage />)
    
    const fileInput = screen.getByLabelText(/upload/i)
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
    
    await userEvent.upload(fileInput, file)
    
    await waitFor(() => {
      expect(screen.getByText(/pdf loaded/i)).toBeInTheDocument()
    })
  })
})
```

## 8. Test Coverage Hedefleri

- **Unit Tests:** %80+ coverage
- **Integration Tests:** Tüm kritik API akışları
- **E2E Tests:** Tüm kullanıcı senaryoları

## 9. Implementation Sırası

1. MSW setup ve handlers
2. Context API testleri (PdfContext, LanguageContext, PopupContext)
3. Component unit testleri (Popup, NavBar, AuthBar, etc.)
4. Integration testleri (PDF operations, Chat)
5. E2E testleri (PDF upload, summa