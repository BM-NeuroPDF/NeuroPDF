/**
 * Canonical E2E credentials. CI must set E2E_* env vars.
 *
 * Local fallbacks are non-production placeholders only; path allowlisted in
 * `.gitleaks.toml` (`frontend/e2e/fixtures/`).
 */

export const E2E_PRIMARY_EMAIL = process.env.E2E_TEST_EMAIL ?? 'test1@gmail.com';

export const E2E_PRIMARY_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'Test1234.';

/** Tiered accounts (seeded via backend dev_only); env overrides for CI. */
export const E2E_PRO_PASSWORD_FALLBACK = process.env.E2E_PRO_PASSWORD ?? 'Test1234!';

export const E2E_STD_PASSWORD_FALLBACK = process.env.E2E_STD_PASSWORD ?? 'Test1234!';
