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

  it('uses legacy backend env keys when NEXT_PUBLIC keys are absent', async () => {
    vi.stubEnv('MAX_FILE_SIZE_GUEST_MB', '6');
    vi.stubEnv('MAX_FILE_SIZE_USER_MB', '12');
    const { MAX_GUEST_MB, MAX_USER_MB, getMaxMergeTotalBytes } =
      await import('../fileLimits');
    expect(MAX_GUEST_MB).toBe(6);
    expect(MAX_USER_MB).toBe(12);
    expect(getMaxMergeTotalBytes(true)).toBe(Math.floor(6 * 1024 * 1024));
    expect(getMaxMergeTotalBytes(false)).toBe(Math.floor(12 * 1024 * 1024));
  });

  it('falls back to defaults on invalid env values', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAX_FILE_SIZE_GUEST_MB', 'zero');
    vi.stubEnv('NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB', '-1');
    const { MAX_GUEST_MB, MAX_USER_MB, getMaxMergeTotalBytes } =
      await import('../fileLimits');
    expect(MAX_GUEST_MB).toBe(5);
    expect(MAX_USER_MB).toBe(50);
    expect(getMaxMergeTotalBytes(true)).toBe(Math.floor(5 * 1024 * 1024));
    expect(getMaxMergeTotalBytes(false)).toBe(Math.floor(50 * 1024 * 1024));
  });
});
