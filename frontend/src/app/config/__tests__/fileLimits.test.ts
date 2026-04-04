import { describe, it, expect, vi, afterEach } from 'vitest';

describe('fileLimits', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('getMaxUploadBytes branches guest vs registered user', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAX_FILE_SIZE_GUEST_MB', '5');
    vi.stubEnv('NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB', '7');
    const { getMaxUploadBytes } = await import('../fileLimits');
    expect(getMaxUploadBytes(true)).toBe(Math.floor(5 * 1024 * 1024));
    expect(getMaxUploadBytes(false)).toBe(Math.floor(7 * 1024 * 1024));
  });
});
