# NeuroPDF UI Modernization Plan

Date: 2026-05-10

This plan turns the UI inventory into an incremental modernization path. The goal is a more modern interface without breaking PDF workflows, auth flows, theme behavior, or the repository's strict test guarantees.

## Guiding Principles

- Modernize incrementally. Do not rewrite the frontend.
- Keep frontend boundaries intact: Next.js App Router, React, Tailwind, existing contexts, and current API contracts.
- Use Tailwind CSS and Shadcn-style component patterns for new and touched UI.
- Prefer shared primitives over repeated page-level styling.
- Treat the PDF viewer as the highest-risk surface.
- Preserve dark mode, i18n, auth behavior, guest limits, and Pro flows.
- Add or update tests with each production UI change.

## Current Risk Map

| Area | Risk | Why |
| --- | --- | --- |
| PDF viewer and edit/merge/summarize flows | High | Browser-only `react-pdf`, PDF.js worker setup, dynamic imports, cMap config, tool-specific state, E2E dependence. |
| Theme tokens and global CSS | High | Global button styles, mixed semantic/page-specific tokens, undefined `--background-rgb` reference, widespread CSS var usage. |
| Shared UI primitive gap | Medium | `components/ui` is thin, so pages currently solve visual patterns locally. |
| Auth pages | Medium | High visibility but low PDF complexity; good early modernization target. |
| Navigation and responsive shell | Medium | Global surface across all pages; mobile menu and auth/language/theme controls must remain stable. |
| Documents/profile/pricing pages | Medium | User-facing and stateful, but less coupled to PDF.js than viewer flows. |
| Chat surfaces | Medium to high | Stateful UI with SSE/message behavior and Pro/global variants. |

## Phase 0: Inventory And Baseline

Status: started.

Deliverables:

- `docs/ui-inventory.md`
- `docs/modernization-plan.md`
- Baseline screenshots or Playwright traces for main routes.
- A small list of approved primitives to introduce first.

Tasks:

- Keep `docs/ui-inventory.md` updated with route, component, style, and PDF findings.
- Capture current screenshots for:
  - `/`
  - `/login`
  - `/register`
  - `/upload`
  - `/extract-pdf`
  - `/edit-pdf`
  - `/merge-pdf`
  - `/summarize-pdf`
  - `/documents`
  - `/profile`
  - `/pricing`
- Record mobile and desktop baselines for navigation and PDF panels.
- Confirm whether Tailwind v4 alpha remains acceptable during modernization, or whether stabilization is a separate technical track.

Exit criteria:

- Inventory exists in `docs/`.
- First primitive set is agreed.
- Risky PDF worker duplication is tracked.
- Relevant test commands are known before code changes begin.

Recommended verification:

- No tests required for docs-only edits.
- After screenshots are automated, run focused Playwright route smoke tests.

## Phase 1: Foundation Primitives

Goal: create a small, consistent UI base before touching many screens.

Deliverables:

- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/card.tsx` or `surface.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/dialog.tsx` if an existing modal target is selected.
- `frontend/src/components/ui/toolbar.tsx` for PDF/action rows.
- Tests for primitives when they contain variants or behavior.

Tasks:

- Add a small `cn`-based variant pattern using existing `frontend/src/lib/utils.ts`.
- Model variants around existing needs:
  - Button: `primary`, `secondary`, `ghost`, `destructive`, `link`, `icon`.
  - Size: `sm`, `md`, `lg`, `icon`.
  - Surface/Card: default, muted, elevated, interactive.
- Keep styles token-backed via Tailwind arbitrary CSS variable utilities where needed.
- Avoid new dependencies unless explicitly approved.
- Do not remove global `.btn-primary` or `button` defaults immediately; migrate usage gradually.

Risks:

- Changing global button behavior too early can break controls across the app.
- Overbuilding variants before using them will create churn.

Exit criteria:

- New primitives exist and are used by at least one low-risk screen.
- Measured coverage remains at 100%.

Recommended verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run test:run`
- `cd frontend && npm run test:coverage` when primitives or tested components are changed.

## Phase 2: Low-Risk High-Visibility Screens

Goal: prove the new design language outside the PDF viewer first.

Primary targets:

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/register/page.tsx`
- `frontend/src/components/NavBar.tsx`
- `frontend/src/app/page.tsx`

Tasks:

- Replace repeated auth card/button/input styling with primitives.
- Fix the `--background-rgb` gap in navigation by either defining the token or replacing the usage with a supported token/class.
- Keep language switcher, theme toggle, auth state, mobile menu, and route active state unchanged.
- Convert obvious inline styles to token-backed Tailwind utilities or primitives.
- Preserve current translations and copy unless product copy changes are explicitly requested.

Risks:

- NavBar is global and can affect all routes.
- Auth pages may have OAuth/EULA behavior that needs regression coverage.

Exit criteria:

- Auth pages and landing page share Button/Card/Input primitives.
- NavBar token usage is valid.
- Mobile and desktop navigation remain functional.

Recommended verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run test:run -- src/__tests__/unit/components/NavBar.test.tsx`
- `cd frontend && npm run test:run -- src/__tests__/unit/components/AuthBar.test.tsx`
- `cd frontend && npm run test:e2e -- auth.spec.ts`

## Phase 3: PDF Viewer Foundation

Goal: modernize the PDF experience starting with the shared viewer shell, not every tool page at once.

Primary targets:

- `frontend/src/components/PdfViewer.tsx`
- `frontend/src/app/Providers.tsx`
- `frontend/src/components/edit-pdf/EditPdfDocument.tsx`
- New shared PDF worker bootstrap helper if introduced.

Tasks:

- Centralize PDF.js worker setup into one helper module.
- Keep `/pdf.worker.mjs`, `cMapUrl: '/cmaps/'`, text layer CSS, and annotation layer CSS behavior intact.
- Extract the viewer toolbar pattern into a reusable component or `ui/toolbar` primitive.
- Replace local `buttonClass` and `buttonStyle` in `PdfViewer.tsx` with Button variants.
- Preserve page input validation, clamping, zoom limits, loading state, and error state.
- Avoid changing PDF rendering scale defaults unless separately tested.

Risks:

- Worker setup regressions can break all PDF rendering.
- PDF rendering is partly browser-dependent and may not be fully represented by unit tests.
- Dynamic import boundaries must remain client-only.

Exit criteria:

- Worker setup has one source of truth.
- `PdfViewer` uses shared UI primitives.
- Upload, summarize, merge result, and edit preview flows still render PDFs.

Recommended verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run test:run -- src/components/__tests__/PdfViewer.test.tsx`
- `cd frontend && npm run test:e2e -- pdf-upload.spec.ts`
- `cd frontend && npm run test:e2e -- pdf-merge.spec.ts`
- `cd frontend && npm run test:e2e -- pdf-summarize.spec.ts`

## Phase 4: PDF Tool Pages

Goal: apply the modernized viewer and primitives across PDF workflows.

Primary targets:

- `frontend/src/app/upload/page.tsx`
- `frontend/src/app/convert-pdf/page.tsx`
- `frontend/src/app/extract-pdf/page.tsx`
- `frontend/src/app/merge-pdf/page.tsx`
- `frontend/src/app/summarize-pdf/page.tsx`
- `frontend/src/components/pdf-tools/PdfToolDropzoneCard.tsx`
- `frontend/src/components/pdf-tools/PdfToolResultActions.tsx`
- `frontend/src/components/merge-pdf/MergeResultPanel.tsx`
- `frontend/src/components/SummarizePdfWorkArea.tsx`

Tasks:

- Standardize dropzone cards, result action rows, empty states, progress/busy overlays, and error states.
- Keep guest gating and usage limit behavior unchanged.
- Reduce one-off inline styles in PDF tool pages.
- Ensure mobile layouts keep usable touch targets and do not hide primary actions.

Risks:

- Tool flows may have different file state assumptions.
- Guest limits and save/download behavior are security and product-sensitive.

Exit criteria:

- PDF tool pages use shared Button/Card/Toolbar/Dropzone patterns.
- Result actions look and behave consistently.
- Existing E2E PDF specs pass.

Recommended verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run test:run -- src/hooks/__tests__/useMergePdf.test.ts`
- `cd frontend && npm run test:run -- src/hooks/__tests__/usePdfToolUpload.test.tsx`
- `cd frontend && npm run test:e2e:responsive`

## Phase 5: Documents, Profile, Pricing, And Chat

Goal: modernize remaining major product surfaces after the core UI language is stable.

Primary targets:

- `frontend/src/components/documents/DocumentsClientPanel.tsx`
- `frontend/src/app/profile/page.tsx`
- `frontend/src/components/ProfileHeroCard.tsx`
- `frontend/src/components/ProfileStatsCards.tsx`
- `frontend/src/app/pricing/page.tsx`
- `frontend/src/components/ProGlobalChat*.tsx`
- `frontend/src/components/chat/**`

Tasks:

- Bring document cards, profile cards, pricing cards, and chat panels onto shared surfaces.
- Preserve API/cache behavior, account deletion behavior, profile avatar upload, and Pro gating.
- Modernize loading, empty, error, and quota states consistently.
- Keep chat input, message rendering, translation, and attachment behavior unchanged.

Risks:

- Chat surfaces may involve streaming behavior and auth/session state.
- Profile/account flows include destructive account actions.

Exit criteria:

- Major remaining pages use the shared visual language.
- Chat and profile E2E tests pass.

Recommended verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run test:run`
- `cd frontend && npm run test:e2e -- profile.spec.ts`
- `cd frontend && npm run test:e2e -- chat-actions.spec.ts`
- `cd frontend && npm run test:e2e -- chat-history.spec.ts`

## Phase 6: CSS Cleanup And Hardening

Goal: remove legacy styling coupling once enough screens use primitives.

Tasks:

- Audit remaining `style={{...}}` usages.
- Audit remaining `.btn-primary`, `.container-card`, `.docs-*`, and broad `button` selector dependencies.
- Narrow or remove global `button` styling after all important buttons use explicit primitives.
- Normalize token naming:
  - Base: background, foreground, border, surface, muted.
  - Brand/action: primary, primary-foreground, accent, destructive.
  - Component-specific tokens only where necessary.
- Document token rules in `docs/frontend/` if the design language becomes stable enough.

Risks:

- Removing global CSS too early can change many untested visual states.
- Token renames can cause subtle dark mode regressions.

Exit criteria:

- Global CSS contains base tokens and necessary app-wide styles, not page-level component implementations.
- Inline styles are limited to unavoidable runtime-calculated values.
- The UI primitive layer is the default path for new visual work.

Recommended verification:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run test:coverage`
- `cd frontend && npm run test:e2e:responsive`
- Manual dark/light review on the main routes.

## Phase 8: Residual Token Migration Backlog

**Status: completed** (2026-05-10).

Goal: remove remaining legacy semantic CSS-variable usage from components and pages by migrating to `np-*` Tailwind utilities, in **low → medium → critical** order, then remove **only dead** definitions from `globals.css` (not the full semantic alias layer).

Execution order (approved): **low → medium → critical**, with **`globals.css` dead-token pass last** after component migrations. **Do not conflate** “remove unused definitions” with “remove `--background` / `--foreground` / `--container-*` aliases”; the latter is **Phase 9**.

### Completion summary

| Step | Scope | Status |
| --- | --- | --- |
| Low risk | MarkdownViewer, NeuroLogo, AvatarUploadStep, layout | Done |
| M1 | UI primitives + page | Done |
| M2 | Profile / account | Done |
| M3 | Summarize / merge / result actions | Done |
| Critical | ClientPdfPanel, ResponsivePdfPanel, PdfViewer, PdfPreviewModal, EulaGuard | Done |
| `globals.css` | Remove **orphan** token definitions only; fix last TSX stragglers (e.g. UsageLimitModal) | Done |

Verification: **738** Vitest tests green throughout; `npm run typecheck` clean. Intentional remaining `var(--spacing-np-navbar)` in TS/TSX for layout offset (navbar height).

### Risk Buckets (reference — all migrated under Phase 8)

#### Low

- `frontend/src/components/MarkdownViewer.tsx`
- `frontend/src/components/NeuroLogo.tsx`
- `frontend/src/components/avatar/AvatarUploadStep.tsx`
- `frontend/src/app/layout.tsx`

#### Medium

- `frontend/src/app/page.tsx`
- `frontend/src/components/AccountSettingsSection.tsx`
- `frontend/src/components/ProfileAvatarModal.tsx`
- `frontend/src/components/ProfileHeroCard.tsx`
- `frontend/src/components/ProfileStatsCards.tsx`
- `frontend/src/components/DeleteAccountModal.tsx`
- `frontend/src/components/SummarizePdfWorkArea.tsx`
- `frontend/src/components/SummaryResultPanel.tsx`
- `frontend/src/components/SummaryAudioPlayer.tsx`
- `frontend/src/components/SummarizeBusyOverlay.tsx`
- `frontend/src/components/merge-pdf/MergeResultPanel.tsx`
- `frontend/src/components/pdf-tools/PdfToolResultActions.tsx`
- `frontend/src/components/LlmPreferenceCard.tsx`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/input-otp.tsx`
- `frontend/src/components/UsageLimitModal.tsx`

#### Critical

- `frontend/src/components/ClientPdfPanel.tsx`
- `frontend/src/components/ResponsivePdfPanel.tsx`
- `frontend/src/components/PdfViewer.tsx`
- `frontend/src/components/PdfPreviewModal.tsx`
- `frontend/src/components/auth/EulaGuard.tsx`

### Phase 8 Checklist (all done)

1. **Low-risk pass** — Migrated; typecheck + full test run.
2. **Medium-risk pass** — Profile, summarize, merge/result, primitives; typecheck + full test run.
3. **Critical pass** — PDF panels, viewer, preview, EULA; typecheck + full test run.
4. **`globals.css` (Phase 8 scope)** — Removed definitions with **no** `var(--…)` consumers (e.g. orphaned summarize tokens, unused `--danger-action-text`, `--font-mono`, `--np-glass-blur`). Semantic aliases still used inside `globals.css` rules are **unchanged** (deferred to Phase 9).
5. **Closure gate (Phase 8)** — TS/TSX free of legacy `var(--background)` etc.; prose/chat/button rules in `globals.css` may still reference semantic aliases until Phase 9.

---

## Phase 9: Globals Semantic Alias Removal (done)

**Status: slices 1–5 done** — `globals.css` no longer defines or consumes legacy semantic helpers (`--chat-*`, `--info-*`, `--error-*`, `--google-*`, `--llm-*`, `--gold-*`); rules use **`--np-*`** and **`color-mix`** where light/dark diverge. Remaining tokens are the **`@theme` → `--np-*` bridges**, spacing/radius scales, Next font vars, and prose plugin mappings (already on `--np-*`).

Goal: inside `frontend/src/app/globals.css`, replace rule-by-rule uses of **semantic aliases** (`--background`, `--foreground`, `--container-bg`, `--container-border`, `--navbar-*`, `--button-bg`, `--button-text`, `--card-shadow`, chat/google/info/error helpers, `--tw-prose-*` mappings, etc.) with direct **`--np-*`** (or Tailwind `np-*` utilities where rules are simplified). Then **drop** the alias definitions from `:root` / `.dark` when nothing references them.

### Slice 1 (done)

- **`body`:** `var(--np-background)`, `var(--np-on-background)`; removed `--background` alias (no remaining consumers).
- **`.container-card`:** light `var(--np-surface)` + fixed light shadow; **`.dark .container-card`** `var(--np-surface-container)` + `var(--np-overlay-shadow)`; border `var(--np-outline-variant)`; text `var(--np-on-background)` (same as former `--foreground`).
- **Removed definitions:** `--background` (both themes), `--card-shadow` (both themes).
- **`--foreground`**, **`--container-bg`**, **`--container-border`** kept for prose, chat, and other rules until a later slice.

### Slice 2 (done)

- **Removed:** `--button-bg`, `--button-text` from `:root` and `.dark`.
- **Global `button` + `:focus-visible`:** `var(--np-action-primary)` / `var(--np-on-action-primary)`; focus ring `color-mix` uses `--np-action-primary`.
- **Components layer:** `.btn-primary`, `.chat-input-field:focus`, `.nav-link-summarize.active` → same `np-action` pair.
- **Chat focus glow:** replaced invalid `rgba(var(--button-bg), …)` with `color-mix(in srgb, var(--np-action-primary) 22%, transparent)`.
- **Prose (minimal):** `--tw-prose-links` and `--tw-prose-quote-borders` now `var(--np-action-primary)` so aliases could be dropped; full prose token pass remains **slice 3**.

### Slice 3 (done)

- **`.prose`:** Tüm `--tw-prose-*` değerleri doğrudan `var(--np-on-background)`, `var(--np-outline-variant)`, `var(--np-action-primary)`, `var(--np-surface)`; **`--tw-prose-pre-bg`** koyu tema için **`.dark .prose`** ile `var(--np-surface-container)` (eski `--container-bg` ayrımı korunur).
- **Kaldırılan alias tanımları:** `--foreground`, `--container-bg`, `--container-border` (`:root` ve `.dark`).
- **Bileşen katmanı:** `.btn-google` metin rengi `var(--np-on-background)`; `.chat-container` kenarlık `var(--np-outline-variant)`; `.chat-input-wrapper` zemin açık `var(--np-surface)` + **`.dark .chat-input-wrapper`** `var(--np-surface-container)`; `.chat-input-field` metin `var(--np-on-background)`.

### Slice 4 (done)

- **Kaldırılan:** `--navbar-bg`, `--navbar-border`, `--navbar-height` (`--navbar-height` yalnızca `var(--spacing-np-navbar)` alias’ıydı; layout zaten `var(--spacing-np-navbar)` kullanıyor).
- **`header`:** Açık tema `color-mix(in srgb, var(--np-surface) 88%, transparent)` + alt çizgi `var(--np-outline-variant)`; **`.dark header`** `color-mix(in srgb, var(--np-surface-container) 40%, transparent)`.
- **Bileşen:** `.chat-input-wrapper` üst kenar, `.llm-selection-container` çerçeve → `var(--np-outline-variant)`.

### Slice 5 (done)

- **Kaldırılan tanımlar (`:root` / `.dark`):** `--chat-*`, `--info-*`, `--error-*`, `--google-*`, `--llm-*`, `.dark` içindeki `--gold-*` ve ilgili tekrarlar.
- **`.btn-google`:** kenarlık / hover yüzeyleri `var(--np-outline-variant)`, `var(--np-surface-container)`; koyu hover `color-mix(in srgb, var(--np-surface-variant) 40%, transparent)`.
- **`.info-box` / `.error-box`:** açık tema formülleri doğrudan `--np-*`; koyu tema `.dark` alt sınıflarında `secondary-container` / `error` karışımları ve metin renkleri.
- **Sohbet:** konteyner ve mesaj alanı `var(--np-surface-container-low)`; balonlar `primary-container` / `surface-variant` çiftleri; giriş alanı `var(--np-surface)` + `var(--np-outline-variant)`.
- **Özet / altın vurgu:** `var(--np-tertiary)` ve `color-mix` hover; glow gradyanı `--np-tertiary`.
- **LLM seçim:** konteyner `var(--np-surface-container)` + **`.dark`** için yüzey karışımı; aktif düğme `var(--np-primary)` / `on-primary` ve tema bazlı gölge `color-mix` oranları (22% / 35%).

Scope notes:

- `@theme` `--color-np-*` bridges stay unless the design system is reworked; this phase targets **legacy semantic names**, not the full `np` palette.
- Expect touch points: `body`, `.btn-primary`, `.container-card`, `.google-btn`, chat layout classes, typography plugin overrides, focus rings using `--button-bg`.
- Verify with `npm run typecheck`, `npm run test:run`, manual light/dark on core routes, and any PDF/chat E2E smoke you rely on.

Exit criteria:

- No remaining **definitions** of removed aliases in `globals.css`, or a documented minimal compatibility set if something external must keep one name.
- Behavior and contrast match Phase 8 baselines (no accidental global button/chat regressions).

---

## Phase 10: Authenticated E2E expansion (in progress)

**Goal:** Extend Playwright coverage for **logged-in** `/documents` and **theme consistency** on `/profile` + `/documents` without duplicating `profile.spec.ts` (profile content remains covered there).

**Deliverables:**

- `frontend/e2e/tests/phase10-authenticated-routes.spec.ts` — **`/health` + API `/auth/login` viability** guards (skip fast when stack or credentials/OTP are not ready); serial execution; documents asserts **Belgelerim** + **Yenile** and absence of guest-only copy; light/dark runs via `addInitScript` + `loginAsTestUser` then both routes.
- **Run:** `npm run test:e2e:phase10` from `frontend/` (set `PLAYWRIGHT_BASE_URL=https://127.0.0.1:3000` when using `next dev --experimental-https`; CI `next start` genelde `http://127.0.0.1:3000`).
- **CI / local:** Requires backend, frontend, and E2E credentials (`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`); OTP envs if 2FA is on (`E2E_OTP_CODE` or per-email override). Same assumptions as `profile.spec.ts` / `helpers.login`.

**CI:** Repo `.github/workflows/ci.yml` içindeki `e2e-tests` job’u zaten `npx playwright test --project=chromium` ile **tüm** `e2e/tests/*.spec.ts` dosyalarını koşturur; `phase10-authenticated-routes.spec.ts` dahildir (`PLAYWRIGHT_BASE_URL` varsayılan `http://127.0.0.1:3000`, `next start`). Ayrı bir `test:e2e:phase10` adımı gerekmez.

**Giriş sorunlarında teşhis:** Şifre adımı doğrudan backend’e gider — `POST http://127.0.0.1:8000/auth/login` (Next.js `3000` üzerindeki `/api/auth/...` ile karıştırma). CI’da `RATE_LIMIT_ENABLED=false` artık backend `Settings` tarafından okunur (önceden yok sayılıyordu; paralel E2E’de 429 riski). `e2e/support/e2e-auth-probe.ts` içindeki `isE2EFullLoginViable` login → `verify-2fa` zincirini doğrular (Redis + magic OTP + `E2E_OTP_CODE`). Tüm suite’i “login kırıkken skip” ile yeşile boyamak önerilmez; altyapıyı düzeltmek veya Phase 10’u probe ile net skip mesajı vermek daha doğru.

**Exit criteria:** `e2e-tests` job’u main/PR’da yeşil (Phase 10 dahil **passed**, skip değil) ve bu bölüm güncel; isteğe bağlı: `storageState` fixture ile tekrarlayan login süresini kısaltma.

## Suggested First Implementation Slice

The first code PR should be intentionally small:

1. Add `Button` and `Surface/Card` primitives under `frontend/src/components/ui/`.
2. Modernize `login/page.tsx` or `register/page.tsx` with those primitives.
3. Fix or remove the invalid `--background-rgb` reference in `NavBar.tsx` only if included in the same focused scope.
4. Add/update tests only for touched behavior.

Why this slice:

- It proves the design-system direction.
- It avoids the PDF worker/rendering risk in the first code change.
- It creates primitives that can later be reused in `PdfViewer`.

## Testing Strategy By Change Type

| Change Type | Minimum Verification |
| --- | --- |
| Docs-only | No automated tests required. |
| Primitive-only with no behavior | Typecheck plus focused unit tests if variants have logic. |
| Primitive used in measured component | Focused Vitest plus coverage. |
| Auth UI | Auth unit tests plus `auth.spec.ts`. |
| NavBar/responsive shell | NavBar unit tests plus mobile Playwright smoke. |
| PDF viewer | `PdfViewer` tests plus PDF upload/merge/summarize E2E. |
| PDF edit/merge/summarize tools | Relevant hook/component tests plus responsive E2E. |
| Chat/profile/account | Focused unit/integration tests plus chat/profile E2E. |

## Open Questions

- Should Tailwind v4 alpha remain the modernization baseline, or should stabilization be tracked separately before broad token work?
- Should `components/ui` follow generated Shadcn file conventions exactly, or use local Shadcn-style primitives without adding the CLI/config?
- Should screenshots become a committed Playwright artifact workflow, or remain manual during early phases?
- Which visual direction should the brand use: current red/yellow PDF identity, a calmer document-app palette, or a hybrid with restrained accents?
