import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useUserStats } from '@/hooks/useUserStats';

const mockSWR = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockSWR(...args),
}));

describe('useUserStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWR.mockReturnValue({ data: undefined, error: undefined });
    delete process.env.VITEST;
  });

  it('uses stats endpoint key for authenticated non-vitest sessions', () => {
    renderHook(() => useUserStats({ user: { email: 'a@a.com' } } as never, 'authenticated'));
    expect(useSWRMock).toHaveBeenCalledWith(
      '/files/user/stats',
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 30_000, revalidateOnFocus: false }),
    );
  });

  it('uses null key when user is not authenticated', () => {
    renderHook(() => useUserStats(null, 'unauthenticated'));
    expect(useSWRMock).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 30_000, revalidateOnFocus: false }),
    );
  });

  it('uses null key under vitest mode guard', () => {
    process.env.VITEST = '1';
    renderHook(() => useUserStats({ user: { email: 'a@a.com' } } as never, 'authenticated'));
    expect(useSWRMock).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 30_000, revalidateOnFocus: false }),
    );
  });
});
