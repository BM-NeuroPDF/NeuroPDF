import {
  E2E_PRIMARY_EMAIL,
  E2E_PRIMARY_PASSWORD,
  E2E_PRO_PASSWORD_FALLBACK,
  E2E_STD_PASSWORD_FALLBACK,
} from './credentials';

export type E2ETestUser = {
  email: string;
  password: string;
  username: string;
};

export const proUser: E2ETestUser = {
  email: process.env.E2E_PRO_EMAIL || 'pro@test.com',
  password: E2E_PRO_PASSWORD_FALLBACK,
  username: process.env.E2E_PRO_USERNAME || 'pro_user_e2e',
};

export const standardUser: E2ETestUser = {
  email: process.env.E2E_STD_EMAIL || 'std@test.com',
  password: E2E_STD_PASSWORD_FALLBACK,
  username: process.env.E2E_STD_USERNAME || 'std_user_e2e',
};

export const guestUsageLimit = Number(process.env.E2E_GUEST_MAX_USAGE || '3');

/**
 * Chat history / legacy flows — same primary credentials as `loginAsTestUser`.
 */
export const historyFlowUser: E2ETestUser = {
  email: E2E_PRIMARY_EMAIL,
  password: E2E_PRIMARY_PASSWORD,
  username:
    process.env.E2E_TEST_USERNAME ||
    E2E_PRIMARY_EMAIL.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '_') ||
    'test1',
};
