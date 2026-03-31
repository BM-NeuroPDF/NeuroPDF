# NeuroPDF Test Strategy

This document captures the test strategy, final achieved counts, and environment-specific configuration (including Fedora) for NeuroPDF. The project has reached **cross-browser E2E success** and a stable unit/integration suite.

---

## Final Test Counts

| Layer | Tool | Count | Status |
|-------|------|-------|--------|
| E2E (cross-browser) | Playwright | **27 / 27** | All scenarios passing |
| Frontend unit | Vitest | **128 / 128** | All unit tests passing |
| Frontend integration | Vitest | **41 / 41** | All integration tests passing |
| Backend | Pytest | See [backend-tests.md](backend-tests.md) | Unit, integration, API markers |

E2E runs against Chromium, Firefox, and WebKit (on Fedora, WebKit project uses Chromium for compatibility). Unit and integration tests run in jsdom with Vitest.

---

## Test Categories

| Category | Location | Framework | Notes |
|----------|----------|------------|--------|
| E2E | `frontend/e2e/tests/*.spec.ts` | Playwright | Auth, guest limits, PDF upload/summarize/merge/chat, profile |
| Unit | `frontend/src/**/__tests__/*.test.{ts,tsx}`, `frontend/src/__tests__/unit/` | Vitest | Components, contexts, hooks, utils, page |
| Integration | `frontend/src/__tests__/integration/` | Vitest + MSW | API mocking, upload flow, PDF operations, chat |
| Backend | `backend/tests/` (unit, api, integration) | Pytest | conftest markers: unit, integration, api |

---

## Playwright Configuration

**File:** [frontend/playwright.config.ts](../../frontend/playwright.config.ts)

| Option | Value | Reason |
|--------|--------|--------|
| `timeout` | `90000` (90s) | LLM and PDF operations can be slow; avoids flaky failures on heavier tests |
| `workers` | `process.env.CI ? 1 : 2` | On CI (e.g. Fedora), single worker to avoid CPU contention; locally 2 for speed |
| `retries` | `2` | Transient failures (network, LLM latency); retry on both CI and local |
| `testDir` | `./e2e/tests` | All E2E specs live under this directory |
| `testMatch` | `.*\.spec\.(ts|tsx|js|jsx)$` | Only spec files are run |

**WebKit on Fedora:** The WebKit project is configured with `browserName: 'chromium'` (see `projects` in config) due to library compatibility issues on Fedora. Cross-browser coverage is still achieved via Chromium and Firefox; for native WebKit, see [frontend/WEBKIT_FIX.md](frontend/WEBKIT_FIX.md).

---

## Vitest Configuration

**File:** [frontend/vitest.config.ts](../../frontend/vitest.config.ts) (and project root `vitest.config.ts` if present)

- **Environment:** `jsdom`
- **Setup:** `vitest.setup.ts`
- **Paths:** Unit tests under `src/**/__tests__/` and `src/__tests__/unit/`; integration under `src/__tests__/integration/`
- **Coverage:** v8 provider; reporters: text, json, html

Commands:

- `npm test` / `npm run test` — watch mode
- `npm run test:run` — single run
- `npm run test:coverage` — coverage report
- `npm run test:unit` — unit only (if script exists)
- `npm run test:integration` — integration only (if script exists)

---

## Backend Pytest Configuration

**File:** [backend/tests/conftest.py](../../backend/tests/conftest.py)

| Feature | Description |
|---------|-------------|
| **Markers** | `unit`, `integration`, `api` — for filtering (e.g. `pytest -m unit`) |
| **Test DB** | `TEST_DB_*` env vars (or fallback to `DB_*`); default DB name `test_db` |
| **Optional deps** | `pypdf` checked at session start; tests can be skipped with `@pytest.mark.skipif` (`requires_pypdf`) |
| **Fixtures** | `test_db` session with rollback; `client` (TestClient); auth helpers for JWT |

Run:

- `pytest tests/ -v` — all tests
- `pytest tests/ -v -m unit` — unit only
- `pytest tests/ -v -m integration` — integration only
- `pytest tests/ -v --cov=app` — with coverage

---

## Fedora-Specific Notes

- **Playwright:** Use `workers: 1` on CI/Fedora to reduce CPU contention (config already uses `process.env.CI ? 1 : 2`). Timeout 90s helps with LLM-backed E2E tests.
- **WebKit:** On Fedora, native WebKit may fail due to system library issues; the config runs the WebKit project with `browserName: 'chromium'` so the same specs pass. For real WebKit, see [WEBKIT_FIX.md](frontend/WEBKIT_FIX.md).
- **Environment:** Setting `CI=1` (e.g. in CI pipelines or when simulating CI locally) forces single-worker Playwright and forbids `test.only`.

---

## Related Documentation

- [testing/README.md](README.md) — Test reports and frontend/backend test guides
- [TEST_SCRIPTS.md](TEST_SCRIPTS.md) — Scripts for running tests (Docker and local)
- [frontend/WEBKIT_FIX.md](frontend/WEBKIT_FIX.md) — WebKit (Safari) E2E setup and Fedora workaround
- [backend-tests.md](backend-tests.md) — Backend test layout and markers
