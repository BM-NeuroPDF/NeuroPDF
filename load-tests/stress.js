/**
 * k6 yük testi: DB + /files/chat/sessions davranışını ölçer.
 *
 * ÖNEMLİ: /auth/login IP başına dakikada sınırlıdır (RATE_LIMIT_AUTH_PER_MINUTE, varsayılan 10).
 * Her VU'nun her iterasyonda login atması neredeyse tüm isteklerin 429 dönmesine yol açar.
 * Bu yüzden setup() içinde tek sefer login alınır; yük altında test edilen uç nokta sessions'tır.
 *
 * Ortam değişkenleri (opsiyonel):
 *   K6_BASE_URL   (varsayılan http://localhost:8000)
 *   K6_E2E_EMAIL  (varsayılan pro@test.com)
 *   K6_E2E_PASSWORD (varsayılan Test1234!)
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:8000';
const E2E_EMAIL = __ENV.K6_E2E_EMAIL || 'pro@test.com';
const E2E_PASSWORD = __ENV.K6_E2E_PASSWORD || 'Test1234!';

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    throw new Error(
      `setup login failed: ${loginRes.status} ${String(loginRes.body).slice(0, 200)}`
    );
  }

  let body;
  try {
    body = loginRes.json();
  } catch {
    throw new Error('setup login: JSON parse failed');
  }

  const token = body.access_token;
  if (!token) {
    throw new Error('setup login: no access_token in response');
  }

  return { token };
}

export default function (data) {
  const sessionsRes = http.get(`${BASE_URL}/files/chat/sessions`, {
    headers: {
      Authorization: `Bearer ${data.token}`,
    },
  });

  check(sessionsRes, {
    'chat sessions status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
