import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useGuestLimit } from '../useGuestLimit';
import { guestService } from '@/services/guestService';

// Mock dependencies
vi.mock('next-auth/react');
vi.mock('@/services/guestService');

describe('useGuestLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when status is authenticated without evaluating session data', async () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'authenticated',
    });

    const { result } = renderHook(() => useGuestLimit());

    await act(async () => {
      expect(await result.current.checkLimit()).toBe(true);
    });
    expect(guestService.checkUsage).not.toHaveBeenCalled();
  });

  it('returns true when session is set even if status is unauthenticated', async () => {
    (useSession as any).mockReturnValue({
      data: { user: { id: 'edge' } },
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useGuestLimit());

    await act(async () => {
      expect(await result.current.checkLimit()).toBe(true);
    });
    expect(guestService.checkUsage).not.toHaveBeenCalled();
  });

  it('returns true for authenticated users', async () => {
    (useSession as any).mockReturnValue({
      data: { user: { id: 'user-123' } },
      status: 'authenticated',
    });

    const { result } = renderHook(() => useGuestLimit());

    const canProceed = await result.current.checkLimit();

    expect(canProceed).toBe(true);
    expect(guestService.checkUsage).not.toHaveBeenCalled();
  });

  it('returns false when session is loading', async () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'loading',
    });

    const { result } = renderHook(() => useGuestLimit());

    const canProceed = await result.current.checkLimit();

    expect(canProceed).toBe(false);
  });

  it('clears loading after successful guest check completes', async () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    let finishCheck: (v: {
      can_use: boolean;
      usage_count: number;
      remaining_usage: number;
      message: string;
    }) => void = () => {};
    (guestService.checkUsage as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCheck = resolve;
        })
    );

    const { result } = renderHook(() => useGuestLimit());

    let checkPromise: Promise<boolean>;
    await act(async () => {
      checkPromise = result.current.checkLimit();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await act(async () => {
      finishCheck({
        can_use: true,
        usage_count: 0,
        remaining_usage: 5,
        message: 'ok',
      });
      await checkPromise!;
    });

    expect(result.current.loading).toBe(false);
  });

  it('checks guest usage for unauthenticated users', async () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    (guestService.checkUsage as any).mockResolvedValue({
      can_use: true,
      usage_count: 2,
      remaining_usage: 3,
      message: 'You have 3 uses remaining.',
    });

    const { result } = renderHook(() => useGuestLimit());

    const canProceed = await result.current.checkLimit();

    await waitFor(() => {
      expect(canProceed).toBe(true);
      expect(guestService.checkUsage).toHaveBeenCalled();
      expect(result.current.usageInfo).toBeTruthy();
    });
  });

  it('shows limit modal when guest limit is reached', async () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    (guestService.checkUsage as any).mockResolvedValue({
      can_use: false,
      usage_count: 5,
      remaining_usage: 0,
      message: 'Usage limit reached.',
    });

    const { result } = renderHook(() => useGuestLimit());

    const canProceed = await result.current.checkLimit();

    await waitFor(() => {
      expect(canProceed).toBe(false);
      expect(result.current.showLimitModal).toBe(true);
    });
  });

  it('handles API errors gracefully', async () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    (guestService.checkUsage as any).mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useGuestLimit());

    let canProceed = false;
    await act(async () => {
      canProceed = await result.current.checkLimit();
    });

    await waitFor(() => {
      expect(canProceed).toBe(true);
      expect(result.current.loading).toBe(false);
    });
  });

  it('closes limit modal', () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useGuestLimit());

    result.current.closeLimitModal();

    expect(result.current.showLimitModal).toBe(false);
  });

  it('redirects to login page', () => {
    (useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useGuestLimit());

    // Mock window.location
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { href: '' } as any;

    result.current.redirectToLogin();

    expect(window.location.href).toBe('/login');

    // Restore
    (window as unknown as { location: Location }).location = originalLocation;
  });
});
