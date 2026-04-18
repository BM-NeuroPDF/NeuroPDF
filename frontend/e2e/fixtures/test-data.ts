export type E2ETestUser = {
  email: string;
  password: string;
  username: string;
};

export const proUser: E2ETestUser = {
  email: process.env.E2E_PRO_EMAIL || 'pro@test.com',
  password: process.env.E2E_PRO_PASSWORD || 'Test1234!',
  username: process.env.E2E_PRO_USERNAME || 'pro_user_e2e',
};

export const standardUser: E2ETestUser = {
  email: process.env.E2E_STD_EMAIL || 'std@test.com',
  password: process.env.E2E_STD_PASSWORD || 'Test1234!',
  username: process.env.E2E_STD_USERNAME || 'std_user_e2e',
};

export const guestUsageLimit = Number(process.env.E2E_GUEST_MAX_USAGE || '3');
