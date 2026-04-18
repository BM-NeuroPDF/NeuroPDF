# Continuous Integration (GitHub Actions)

## Workflow

The file [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on **push** and **pull_request** to **`main`**:

1. **`backend-tests`** — Python 3.13, PostgreSQL 16 service, pytest in `backend/tests` and `aiService/tests` (separate venvs per project).
2. **`frontend-unit-tests`** — Node 22, `npm install`, `npm run test:run` (Vitest).
3. **`e2e-tests`** — Depends on both jobs above. Spins up **PostgreSQL 16**, **Redis7**, runs **`alembic upgrade head`**, starts **FastAPI** on `127.0.0.1:8000`, then Node 22: `npm run build`, `npx playwright test --project=chromium`. Frontend and Playwright use **`127.0.0.1`** (not `localhost`) so Node resolves IPv4 and matches the API. CI sets **`E2E_MAGIC_OTP_ENABLED`**, **`E2E_MAGIC_OTP_ALL_USERS`**, and **`E2E_OTP_CODE=123456`** so 2FA login works for all seeded test emails without real mail. Uploads **`playwright-report`** as an artifact on every run (`if: always()`).

## E2E stack notes

- **AI Service** is not started in CI; env points `AI_SERVICE_URL` at a dead port. Specs that need summarization/chat against a real model may need mocks or a future compose step.
- **`NEXTAUTH_URL`** is set for production Next.js builds in CI to silence NextAuth URL warnings.

## Local commands

```bash
# Backend
cd backend && python -m pytest tests/ -v

# AI Service
cd aiService && python -m pytest tests/ -v

# Frontend unit
cd frontend && npm run test:run

# E2E (requires backend + Redis + Postgres locally; match BACKEND_API_URL / NEXT_PUBLIC_API_URL)
cd frontend && npx playwright test --project=chromium
```
