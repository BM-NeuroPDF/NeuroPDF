import type { APIRequestContext } from '@playwright/test';
import { E2E_PRIMARY_EMAIL, E2E_PRIMARY_PASSWORD } from '../fixtures/credentials';

const defaultBackendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';

function primaryUsernameFromEmail(email: string): string {
  return email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
}

function resolveOtpCode(): string | null {
  const normalized = E2E_PRIMARY_EMAIL.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_');
  const scoped = process.env[`E2E_OTP_CODE_${normalized}`]?.trim();
  if (scoped) return scoped;
  const generic = process.env.E2E_OTP_CODE?.trim();
  if (generic) return generic;
  return null;
}

/**
 * Registers the primary E2E user when /auth/login returns 401 (mirrors helpers.ensureUserSeeded).
 * Returns false if seeding could not establish a password login that reaches 2FA.
 */
export async function tryEnsureE2EPrimaryUserSeeded(request: APIRequestContext): Promise<boolean> {
  const email = E2E_PRIMARY_EMAIL;
  const password = E2E_PRIMARY_PASSWORD;
  const username = primaryUsernameFromEmail(email);

  let loginRes = await request.post(`${defaultBackendUrl}/auth/login`, {
    data: { email, password },
    failOnStatusCode: false,
    timeout: 15_000,
  });

  if (loginRes.ok()) {
    try {
      const body = (await loginRes.json()) as {
        status?: string;
        access_token?: string;
      };
      if (body?.status === 'requires_2fa' || body?.access_token) return true;
    } catch {
      return false;
    }
    return false;
  }

  if (loginRes.status() !== 401) return false;

  const registerRes = await request.post(`${defaultBackendUrl}/auth/register`, {
    data: {
      username,
      email,
      password,
      eula_accepted: true,
    },
    failOnStatusCode: false,
    timeout: 15_000,
  });

  if (!registerRes.ok() && registerRes.status() !== 400) return false;

  loginRes = await request.post(`${defaultBackendUrl}/auth/login`, {
    data: { email, password },
    failOnStatusCode: false,
    timeout: 15_000,
  });

  if (!loginRes.ok()) return false;
  try {
    const body = (await loginRes.json()) as { status?: string };
    return body?.status === 'requires_2fa';
  } catch {
    return false;
  }
}

/**
 * True when the same chain the UI uses can obtain an access_token: login → requires_2fa → verify-2fa.
 * Catches Redis/OTP/magic-OTP misconfig that `/health` alone would miss.
 */
export async function isE2EFullLoginViable(request: APIRequestContext): Promise<boolean> {
  const seeded = await tryEnsureE2EPrimaryUserSeeded(request);
  if (!seeded) return false;

  const loginRes = await request.post(`${defaultBackendUrl}/auth/login`, {
    data: { email: E2E_PRIMARY_EMAIL, password: E2E_PRIMARY_PASSWORD },
    failOnStatusCode: false,
    timeout: 15_000,
  });
  if (!loginRes.ok()) return false;

  const loginBody = (await loginRes.json().catch(() => null)) as {
    status?: string;
    temp_token?: string;
  } | null;
  if (!loginBody || loginBody.status !== 'requires_2fa' || !loginBody.temp_token) {
    return false;
  }

  const otp = resolveOtpCode() ?? '123456';

  const verifyRes = await request.post(`${defaultBackendUrl}/auth/verify-2fa`, {
    data: {
      temp_token: loginBody.temp_token,
      otp_code: otp,
    },
    failOnStatusCode: false,
    timeout: 15_000,
  });
  if (!verifyRes.ok()) return false;

  const verifyBody = (await verifyRes.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  return !!verifyBody?.access_token;
}
