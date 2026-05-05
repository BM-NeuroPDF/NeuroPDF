import type { Page } from '@playwright/test';
import { E2E_PRIMARY_EMAIL, E2E_PRIMARY_PASSWORD } from '../fixtures/credentials';
import { login } from './helpers';

/** Login as the primary E2E user (`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`). */
export async function loginAsTestUser(page: Page) {
  await login(page, E2E_PRIMARY_EMAIL, E2E_PRIMARY_PASSWORD);
}
