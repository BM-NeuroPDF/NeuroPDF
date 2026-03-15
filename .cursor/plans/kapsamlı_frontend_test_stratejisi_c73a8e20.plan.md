---
name: Kapsamlı Frontend Test Stratejisi
overview: ""
todos: []
---

# Kapsamlı Frontend Test Stratejisi ve Implementasyon Planı

## Mevcut Durum Analizi

**Mevcut Test Yapısı:**

- ✅ Vitest + React Testing Library (Unit/Integration)
- ✅ Playwright (E2E)
- ✅ Bazı component testleri mevcut (PdfChatPanel, PdfViewer, ProGlobalChat)
- ✅ Bazı hook testleri mevcut (useGuestLimit, usePopup)
- ✅ API utility testleri mevcut
- ⚠️ MSW setup eksik (TEST_README'de bahsedilmiş ama implementasyon yok)
- ⚠️ State Management (Context) testleri eksik
- ⚠️ Integration testler eksik
- ⚠️ E2E testler sadece auth ve profile için mevcut

**Teknoloji Stack:**

- Next.js 15.5.9 (App Router)
- React 19.1.0
- TypeScript
- Context API (State Management)
- NextAuth (Authentication)
- Vitest (Unit/Integration Testing)
- Playwright (E2E Testing)

## Test Klasör Yapısı

```
frontend/
├── src/
│   ├── __tests__/
│   │   ├── integration/
│   │   │   ├── setup.ts                    # MSW server setup
│   │   │   ├── handlers.ts                 # MSW request handlers
│   │   │   ├── pdf-operations.test.tsx     # PDF upload/process integration tests
│   │   │   ├── chat-integration.test.tsx    # Chat API integration tests
│   │   │   ├── auth-integration.test.tsx    # Auth flow integration tests
│   │   │   └── pages/
│   │   │       ├── UploadPage.test.tsx      # Upload page integration
│   │   │       ├── SummarizePage.test.tsx   # Summarize page integration
│   │   │       └── MergePage.test.tsx       # Merge page integration
│   │   └── unit/
│   │       ├── components/
│   │       │   ├── NavBar.test.tsx          # Navigation component
│   │       │   ├── Popup.test.tsx           # Popup component
│   │       │   ├── UsageLimitModal.test.tsx # Limit modal component
│   │       │   ├── LanguageSwitcher.test.tsx # Language switcher
│   │       │   └── AuthBar.test.tsx         # Auth bar component
│   │       ├── context/
│   │       │   ├── PdfContext.test.tsx      # PDF context state tests
│   │       │   ├── LanguageContext.test.tsx # Language context tests
│   │       │   └── PopupContext.test.tsx    # Popup context tests
│   │       ├── hooks/
│   │       │   └── useUnifiedPdfDrop.test.ts # PDF drop hook
│   │       └── services/
│   │           ├── pdfService.test.ts       # PDF service tests
│   │           └── guestService.test.ts     # Guest service tests
│   ├── app/
│   │   └── __tests__/
│   │       └── page.test.tsx                # ✅ Mevcut
│   ├── components/
│   │   └── __tests__/
│   │       ├── PdfChatPanel.test.tsx        # ✅ Mevcut
│   │       ├── PdfViewer.test.tsx          # ✅ Mevcut
│   │       └── ProGlobalChat.test.tsx      # ✅ Mevcut
│   ├── hooks/
│   │   └── __tests__/
│   │       ├── useGuestLimit.test.ts       # ✅ Mevcut
│   │       └── usePopup.test.ts            # ✅ Mevcut
│   └── utils/
│       └── __tests__/
│           └── api.test.ts                 # ✅ Mevcut
├── e2e/
│   ├── tests/
│   │   ├── auth.spec.ts                    # ✅ Mevcut
│   │   ├── profile.spec.ts                 # ✅ Mevcut
│   │   ├── pdf-upload.spec.ts              # 🆕 PDF upload E2E
│   │   ├── pdf-summarize.spec.ts           # 🆕 PDF summarize E2E
│   │   ├── pdf-merge.spec.ts               # 🆕 PDF merge E2E
│   │   ├── chat-flow.spec.ts               # 🆕 Chat flow E2E
│   │   └── guest-limits.spec.ts            # 🆕 Guest limits E2E
│   ├── support/
│   │   └── helpers.ts                      # ✅ Mevcut
│   └── fixtures/
│       └── test-data.ts                    # 🆕 Test data fixtures
├── vitest.config.ts                         # ✅ Mevcut
└── vitest.setup.ts                          # ✅ Mevcut (MSW setup eklenmeli)
```

## Implementation Plan

### Phase 1: Test Infrastructure Setup

**1.1 MSW (Mock Service Worker) Setup**

- `src/__tests__/integration/setup.ts` - MSW server ve handlers setup
- `src/__tests__/integration/handlers.ts` - API endpoint mock handlers
- `vitest.setup.ts` güncellemesi - MSW server'ı başlat/durdur
- `package.json` - `msw` dependency eklenecek

**Dosyalar:**

- `frontend/src/__tests__/integration/setup.ts`
- `frontend/src/__tests__/integration/handlers.ts`
- `frontend/vitest.setup.ts` (güncelleme)
- `frontend/package.json` (msw dependency)

### Phase 2: Unit Tests (Component Level)

**2.1 UI Component Tests**

- `NavBar.test.tsx` - Navigation rendering, link clicks, responsive menu
- `Popup.test.tsx` - Success/error/info popup rendering, auto-close
- `UsageLimitModal.test.tsx` - Modal open/close, limit display, redirect
- `LanguageSwitcher.test.tsx` - Language switching, localStorage persistence
- `AuthBar.test.tsx` - Login/logout button, user display

**Dosyalar:**

- `frontend/src/__tests__/unit/components/NavBar.test.tsx`
- `frontend/src/__tests__/unit/components/Popup.test.tsx`
- `frontend/src/__tests__/unit/components/UsageLimitModal.test.tsx`
- `frontend/src/__tests__/unit/components/LanguageSwitcher.test.tsx`
- `frontend/src/__tests__/unit/components/AuthBar.test.tsx`

**2.2 Form Component Tests**

- Form validation tests (login, register, profile)
- File upload component tests (drag & drop, file validation)

### Phase 3: State Management Tests

**3.1 Context API Tests**

- `PdfContext.test.tsx` - PDF file state, savePdf, clearPdf, chat messages state
- `LanguageContext.test.tsx` - Language switching, localStorage persistence, translation function
- `PopupContext.test.tsx` - showSuccess, showError, showInfo, popup queue management

**Dosyalar:**

- `frontend/src/__tests__/unit/context/PdfContext.test.tsx`
- `frontend/src/__tests__/unit/context/LanguageContext.test.tsx`
- `frontend/src/__tests__/unit/context/PopupContext.test.tsx`

**Test Senaryoları:**

- State initialization
- State updates
- Context provider isolation
- Multiple consumers
- Error handling (context used outside provider)

### Phase 4: Integration Tests

**4.1 API Integration Tests (MSW ile)**

- `pdf-operations.test.tsx` - PDF upload, merge, extract, convert, edit API calls
- `chat-integration.test.tsx` - Chat session start, message send, response handling
- `auth-integration.test.tsx` - Login, register, session management API calls

**Dosyalar:**

- `frontend/src/__tests__/integration/pdf-operations.test.tsx`
- `frontend/src/__tests__/integration/chat-integration.test.tsx`
- `frontend/src/__tests__/integration/auth-integration.test.tsx`

**4.2 Page-Level Integration Tests**

- `UploadPage.test.tsx` - File upload, PDF viewer integration, error handling
- `SummarizePage.test.tsx` - PDF upload → summarize → display summary → chat
- `MergePage.test.tsx` - Multiple file upload → merge → download

**Dosyalar:**

- `frontend/src/__tests__/integration/pages/UploadPage.test.tsx`
- `frontend/src/__tests__/integration/pages/SummarizePage.test.tsx`
- `frontend/src/__tests__/integration/pages/MergePage.test.tsx`

**Test Senaryoları:**

- API success scenarios
- API error scenarios (network errors, 401, 403, 500)
- Loading states
- Data flow (API → State → UI)
- Error boundary handling

### Phase 5: E2E Tests (Playwright)

**5.1 PDF Operations E2E**

- `pdf-upload.spec.ts` - User uploads PDF, views it, interacts with viewer
- `pdf-summarize.spec.ts` - Upload → Summarize → View summary → Start chat
- `pdf-merge.spec.ts` - Upload multiple PDFs → Merge → Download merged PDF
- `pdf-extract.spec.ts` - Upload → Extract pages → Download extracted PDF

**Dosyalar:**

- `frontend/e2e/tests/pdf-upload.spec.ts`
- `frontend/e2e/tests/pdf-summarize.spec.ts`
- `frontend/e2e/tests/pdf-merge.spec.ts`
- `frontend/e2e/tests/pdf-extract.spec.ts`

**5.2 Chat Flow E2E**

- `chat-flow.spec.ts` - Start chat session → Send messages → Receive responses → Chat history

**Dosya:**

- `frontend/e2e/tests/chat-flow.spec.ts`

**5.3 Guest User Limits E2E**

- `guest-limits.spec.ts` - Guest user upload limits, operation limits, redirect to login

**Dosya:**

- `frontend/e2e/tests/guest-limits.spec.ts`

**5.4 Test Fixtures**

- `e2e/fixtures/test-data.ts` - Test user credentials, file paths, selectors

**Dosya:**

- `frontend/e2e/fixtures/test-data.ts` (güncelleme)

## Test Coverage Hedefleri

- **Unit Tests:** %80+ coverage (components, hooks, utils, context)
- **Integration Tests:** Tüm kritik API endpoints ve page workflows
- **E2E Tests:** Tüm kritik user journeys (happy path + error scenarios)

## Test Best Practices

1. **AAA Pattern:** Arrange, Act, Assert
2. **Descriptive Test Names:** "should display error message when file size exceeds limit"
3. **Isolation:** Her test bağımsız çalışmalı
4. **Mocking:** External dependencies mock'lanmalı
5. **Cleanup:** Test sonrası state temizlenmeli
6. **Accessibility:** A11y testleri eklenmeli (opsiyonel)

## Örnek Test Kodları

Her test türü