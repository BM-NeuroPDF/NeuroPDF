import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from 'next-auth';
import { useUserStats } from '@/hooks/useUserStats';

const mockSWR = vi.fn();
const sendRequestMock = vi.fn();

vi.mock('@/utils/api', () => ({
  sendRequest: (...args: unknown[]) => sendRequestMock(...args),
}));

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockSWR(...args),
}));

describe('useUserStats', () => {
  const session: Session = {
    expires: '2099-01-01T00:00:00.000Z',
    user: { email: 'a@a.com' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSWR.mockReturnValue({ data: undefined, error: undefined });
    sendRequestMock.mockResolvedValue({ role: 'Standart' });
    delete process.env.VITEST;
  });

  it('uses stats endpoint key for authenticated non-vitest sessions', () => {
    renderHook(() => useUserStats(session, 'authenticated'));
    expect(mockSWR).toHaveBeenCalledWith(
      '/files/user/stats',
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 30_000, revalidateOnFocus: false }),
    );
  });

  it('fetcher invokes sendRequest with GET', async () => {
    renderHook(() => useUserStats(session, 'authenticated'));
    const fetcher = mockSWR.mock.calls[0][1] as (path: string) => Promise<unknown>;
    await fetcher('/files/user/stats');
    expect(sendRequestMock).toHaveBeenCalledWith('/files/user/stats', 'GET');
  });

  it('uses null key when user is not authenticated', () => {
    renderHook(() => useUserStats(null, 'unauthenticated'));
    expect(mockSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 30_000, revalidateOnFocus: false }),
    );
  });

  it('uses null key under vitest mode guard', () => {
    process.env.VITEST = '1';
    renderHook(() => useUserStats(session, 'authenticated'));
    expect(mockSWR).toHaveBeenCalledWith(
      null,
      expect.any(Function),
      expect.objectContaining({ dedupingInterval: 30_000, revalidateOnFocus: false }),
    );
  });
});
