import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGuestGatedAction } from '@/hooks/useGuestGatedAction';

const incrementUsageMock = vi.fn();
vi.mock('@/services/guestService', () => ({
  guestService: {
    incrementUsage: () => incrementUsageMock(),
  },
}));

describe('useGuestGatedAction', () => {
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
});
