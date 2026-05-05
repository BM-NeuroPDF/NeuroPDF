import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { useCurrentUser, AUTH_ME_SWR_KEY } from '../useCurrentUser';
import { fetchAuthMe } from '@/services/authMeService';

vi.mock('@/services/authMeService', () => ({
  fetchAuthMe: vi.fn(),
}));

const mockedFetchAuthMe = vi.mocked(fetchAuthMe);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

describe('useCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses AUTH_ME_SWR_KEY when shouldFetch is true', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'google' });
    const { result } = renderHook(() => useCurrentUser(true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ provider: 'google' }));
    expect(mockedFetchAuthMe).toHaveBeenCalledWith(AUTH_ME_SWR_KEY);
  });

  it('does not fetch when shouldFetch is false', () => {
    const { result } = renderHook(() => useCurrentUser(false), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(mockedFetchAuthMe).not.toHaveBeenCalled();
  });
});
