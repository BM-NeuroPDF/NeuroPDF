# Continuous Integration (GitHub Actions)

## Workflow

The file [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on **push** and **pull_request** to **`main`**:

1. **`backend-tests`** — Python 3.13, PostgreSQL 16 service, pytest in `backend/tests` and `aiService/tests` (separate venvs per project).
2. **`frontend-unit-tests`** — Node 20, `npm install`, `npm run test:run` (Vitest).
3. **`e2e-tests`** — Depends on both jobs above; Node 20, Playwright Chromium, `npm run build`, then `npx playwright test --project=chromium`. Uploads **`playwright-report`** as an artifact on every run (`if: always()`).

## E2E job and `continue-on-error`

The **`e2e-tests`** job uses **`continue-on-error: true`** because current Playwright specs call [`login()`](../frontend/e2e/support/helpers.ts) against a **real** `BACKEND_API_URL` (`/auth/login`). The CI workflow does **not** start the FastAPI backend or seed users, so many E2E tests are expected to fail until one of the following is added:

- **Full stack:** Postgres + `uvicorn` for `backend`, migrations/seed user, `NEXT_PUBLIC_API_URL` / `BACKEND_API_URL` pointing at that API, and any required **GitHub Secrets** (e.g. Supabase if your seed path uses it).
- **Scoped / mocked E2E:** Auth and API fully mocked via `page.route` (or a test-only credentials bypass), then remove `continue-on-error` for a strict gate.

[Playwright config](../../frontend/playwright.config.ts) sets **`webServer`** only when **`CI=true`**: `npm run start` after `npm run build` (production mode).

## Local commands

```bash
# Backend
cd backend && python -m pytest tests/ -v

# AI Service
cd aiService && python -m pytest tests/ -v

# Frontend unit
cd frontend && npm run test:run

# E2E (requires app reachable at baseURL; start dev or build+start)
cd frontend && npx playwright test --project=chromium
```
