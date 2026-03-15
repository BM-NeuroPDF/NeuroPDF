# Frontend Test Documentation

## 📋 Test Klasör Yapısı

```
frontend/
├── src/
│   ├── app/
│   │   └── __tests__/
│   │       └── page.test.tsx                    # Home page unit tests
│   ├── components/
│   │   └── __tests__/
│   │       ├── PdfChatPanel.test.tsx            # PDF chat panel tests
│   │       ├── PdfViewer.test.tsx                # PDF viewer component tests
│   │       └── ProGlobalChat.test.tsx            # Pro global chat tests
│   ├── hooks/
│   │   └── __tests__/
│   │       ├── useGuestLimit.test.ts             # Guest limit hook tests
│   │       └── usePopup.test.ts                  # Popup hook tests
│   └── utils/
│       └── __tests__/
│           └── api.test.ts                       # API utility tests
├── e2e/                                          # E2E tests (Playwright)
│   ├── tests/
│   │   ├── auth.spec.ts                          # Authentication flow tests
│   │   ├── chat.spec.ts                          # Chat functionality tests
│   │   ├── pdf-operations.spec.ts                # PDF operations tests
│   │   └── profile.spec.ts                       # User profile tests
│   ├── fixtures/
│   │   └── test-data.ts                          # Test data fixtures
│   └── support/
│       └── helpers.ts                            # E2E helper functions
├── test-results/                                 # Test result files (organized)
│   ├── unit/                                     # Unit test results
│   │   └── test-results-unit-*.txt
│   ├── integration/                              # Integration test results
│   │   └── test-results-integration-*.txt
│   ├── e2e/                                      # E2E test results
│   │   └── e2e-test-results-*.txt
│   └── test-results-*.txt                        # General test results
├── vitest.config.ts                              # Vitest configuration
└── vitest.setup.ts                               # Vitest setup file
```

## 🧪 Test Türleri

### 1. Unit Tests (Vitest + React Testing Library)

**Konum:** `src/**/__tests__/*.test.{ts,tsx}`

**Test Dosyaları:**
- `src/app/__tests__/page.test.tsx` - Home page utility logic tests
- `src/components/__tests__/PdfChatPanel.test.tsx` - PDF chat panel component tests
- `src/components/__tests__/PdfViewer.test.tsx` - PDF viewer component tests
- `src/components/__tests__/ProGlobalChat.test.tsx` - Pro global chat component tests
- `src/hooks/__tests__/useGuestLimit.test.ts` - Guest limit hook tests
- `src/hooks/__tests__/usePopup.test.ts` - Popup hook tests
- `src/utils/__tests__/api.test.ts` - API utility function tests

**Çalıştırma:**
```bash
npm run test              # Watch mode
npm run test:run          # Single run
npm run test:coverage     # With coverage report
```

### 2. Integration Tests (Vitest + MSW)

**Konum:** `src/__tests__/integration/`

**Test Dosyaları:**
- `src/__tests__/integration/setup.ts` - MSW server setup
- `src/__tests__/integration/pdf-operations.test.tsx` - PDF operations integration tests
- `src/__tests__/integration/chat-integration.test.tsx` - Chat integration tests
- `src/__tests__/integration/auth-integration.test.tsx` - Authentication integration tests
- `src/__tests__/integration/pages/SummarizePage.test.tsx` - Summarize page integration tests
- `src/__tests__/integration/workflows/authenticatedUserFlow.test.tsx` - Authenticated user workflow tests
- `src/__tests__/integration/workflows/guestUserFlow.test.tsx` - Guest user workflow tests

**Çalıştırma:**
```bash
npm run test:run          # Run all tests including integration
```

### 3. E2E Tests (Playwright)

**Konum:** `e2e/tests/*.spec.ts`

**Test Dosyaları:**
- `e2e/tests/auth.spec.ts` - Authentication flow E2E tests
- `e2e/tests/chat.spec.ts` - Chat functionality E2E tests
- `e2e/tests/pdf-operations.spec.ts` - PDF operations E2E tests
- `e2e/tests/profile.spec.ts` - User profile E2E tests

**Helper Functions:**
- `e2e/support/helpers.ts` - Login, navigation, and other E2E helpers
- `e2e/fixtures/test-data.ts` - Test user credentials and selectors

**Çalıştırma:**
```bash
npm run test:e2e                    # Run all E2E tests
npm run test:e2e -- --project=chromium  # Run only Chromium
npm run test:e2e -- --project=firefox    # Run only Firefox
npm run test:e2e -- --project=webkit     # Run only WebKit
```

## 📊 Test Sonuçları

Test sonuçları `test-results/` klasörü altında organize edilmiştir:

```
test-results/
├── unit/                    # Unit test sonuçları
├── integration/             # Integration test sonuçları
├── e2e/                     # E2E test sonuçları
└── test-results-*.txt      # Genel test sonuçları
```

## 🔧 Test Konfigürasyonu

### Vitest Config (`vitest.config.ts`)
- Environment: `jsdom` (browser-like environment)
- Setup file: `vitest.setup.ts`
- Path alias: `@` → `./src`
- Coverage provider: `v8`
- Coverage reporters: `text`, `json`, `html`

### Vitest Setup (`vitest.setup.ts`)
- `@testing-library/jest-dom` matchers
- Global mocks for browser APIs
- MSW handlers for integration tests

### Playwright Config
- Projects: Chromium, Firefox, WebKit
- Timeout: 60 seconds
- Action timeout: 15 seconds
- Base URL: `http://localhost:3000`

## 🚀 Test Çalıştırma Komutları

```bash
# Unit tests (watch mode)
npm run test

# Unit tests (single run)
npm run test:run

# Unit tests with coverage
npm run test:coverage

# E2E tests (all browsers)
npm run test:e2e

# E2E tests (specific browser)
npm run test:e2e -- --project=chromium

# All tests
npm run test:all
```

## 📝 Test Yazma Rehberi

### Unit Test Örneği

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import MyComponent from '../MyComponent'

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Integration Test Örneği

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { server } from '@/__tests__/integration/setup'
import MyPage from '@/app/my-page/page'

describe('MyPage Integration', () => {
  it('loads data from API', async () => {
    render(<MyPage />)
    
    await waitFor(() => {
      expect(screen.getByText('Data loaded')).toBeInTheDocument()
    })
  })
})
```

### E2E Test Örneği

```typescript
import { test, expect } from '@playwright/test'
import { login } from '../support/helpers'
import { testUsers } from '../fixtures/test-data'

test('user can perform action', async ({ page }) => {
  await login(page, testUsers.regular.email, testUsers.regular.password)
  
  await page.goto('/my-page')
  await expect(page.locator('h1')).toBeVisible()
})
```

## 🐛 Test Debugging

### Unit/Integration Tests
```bash
# Verbose output
npm run test:run -- --reporter=verbose

# Run specific test file
npm run test:run src/components/__tests__/MyComponent.test.tsx

# Run tests matching pattern
npm run test:run -- -t "test name pattern"
```

### E2E Tests
```bash
# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run in debug mode
npm run test:e2e -- --debug

# Run specific test file
npm run test:e2e e2e/tests/auth.spec.ts

# Generate HTML report
npm run test:e2e -- --reporter=html
```

## 📈 Coverage

Coverage raporları `coverage/` klasöründe HTML formatında oluşturulur:

```bash
npm run test:coverage
# Open coverage/index.html in browser
```

## ✅ Test Best Practices

1. **Unit Tests**: Her component/hook/utility için ayrı test dosyası
2. **Integration Tests**: API entegrasyonları ve sayfa seviyesi testler
3. **E2E Tests**: Kullanıcı akışları ve kritik işlevler
4. **Mocking**: External dependencies için mock kullan
5. **Cleanup**: Her test sonrası state'i temizle
6. **Descriptive Names**: Test isimleri açıklayıcı olsun
7. **AAA Pattern**: Arrange, Act, Assert

## 🔍 Test Sonuçlarını İnceleme

### Unit/Integration Test Sonuçları
```bash
# Son test sonuçlarını görüntüle
cat test-results/unit/test-results-unit-*.txt
cat test-results/integration/test-results-integration-*.txt
```

### E2E Test Sonuçları
```bash
# Son E2E test sonuçlarını görüntüle
cat test-results/e2e/e2e-test-results-*.txt

# HTML raporunu görüntüle
npx playwright show-report
```

## 🎯 Test Kapsamı

### ✅ Test Edilenler
- ✅ Component rendering ve interactions
- ✅ Hook functionality
- ✅ API utility functions
- ✅ PDF operations (upload, extract, merge, summarize)
- ✅ Chat functionality
- ✅ Authentication flow
- ✅ User profile operations
- ✅ Guest user limits

### 📋 Test Edilmesi Gerekenler
- [ ] Error boundary components
- [ ] Loading states
- [ ] Form validations
- [ ] File upload edge cases
- [ ] Responsive design
- [ ] Accessibility (a11y)

## 🛠️ Troubleshooting

### Testler çalışmıyor
```bash
# Node modules'ı yeniden yükle
rm -rf node_modules package-lock.json
npm install

# Vitest cache'i temizle
rm -rf node_modules/.vite
```

### E2E testler başarısız
```bash
# Playwright browser'ları yeniden yükle
npx playwright install

# Test kullanıcısını oluştur (backend)
docker compose exec backend python seed_test_user.py
```

### Coverage raporu oluşmuyor
```bash
# Coverage klasörünü temizle
rm -rf coverage/

# Tekrar çalıştır
npm run test:coverage
```

## 📚 Kaynaklar

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)
