import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuestGatedAction } from '@/hooks/useGuestGatedAction';

const incrementUsageMock = vi.fn();
vi.mock('@/services/guestService', () => ({
  guestService: {
    incrementUsage: () => incrementUsageMock(),
  },
}));

describe('useGuestGatedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not run action when limit check fails', async () => {
    const action = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useGuestGatedAction({
        session: null,
        checkLimit: async () => false,
        onError: vi.fn(),
      }),
    );

    await result.current.runWithGuestCheck(action);
    expect(action).not.toHaveBeenCalled();
    expect(incrementUsageMock).not.toHaveBeenCalled();
  });

  it('runs action when limit allows', async () => {
    const action = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useGuestGatedAction({
        session: { user: { email: 'a@a.com' } } as never,
        checkLimit: async () => true,
        onError: vi.fn(),
      }),
    );

    await result.current.runWithGuestCheck(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(incrementUsageMock).not.toHaveBeenCalled();
  });

  it('increments usage for guest after action', async () => {
    const action = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useGuestGatedAction({
        session: null,
        checkLimit: async () => true,
        onError: vi.fn(),
      }),
    );

    await result.current.runWithGuestCheck(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(incrementUsageMock).toHaveBeenCalledTimes(1);
  });

  it('reports guest increment error via onError', async () => {
    const action = vi.fn(async () => undefined);
    const onError = vi.fn();
    incrementUsageMock.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() =>
      useGuestGatedAction({
        session: null,
        checkLimit: async () => true,
        onError,
      }),
    );

    await result.current.runWithGuestCheck(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
