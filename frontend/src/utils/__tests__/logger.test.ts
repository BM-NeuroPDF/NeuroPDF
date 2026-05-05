import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

import { scrubPii, scrubPiiFromUnknown, logError } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrubPii redacts email and JWT-like segments', () => {
    const raw = 'Mail a@example.com and bearer eyJhbGciOiJIUzI1NiJ9.eyJzIjoxfQ.sig trailing';
    const s = scrubPii(raw);
    expect(s).not.toContain('example.com');
    expect(s).not.toContain('eyJ');
    expect(s).toContain('[REDACTED_EMAIL]');
    expect(s).toContain('[REDACTED_JWT]');
  });

  it('scrubPiiFromUnknown redacts password-key fields', () => {
    const o = scrubPiiFromUnknown({
      ok: 'yes',
      password: 'hunter2',
      nested: { pwd: 'x' },
    }) as Record<string, unknown>;
    expect(o.ok).toBe('yes');
    expect(o.password).toBe('[REDACTED]');
    expect((o.nested as Record<string, unknown>).pwd).toBe('[REDACTED]');
  });

  it('logError invokes Sentry captureException when module loads', async () => {
    logError(new Error('unit-test'), { scope: 'logger.test' });
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
