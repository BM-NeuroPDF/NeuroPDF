import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useProfileAvatar } from '../useProfileAvatar';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

describe('useProfileAvatar', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURLMock = vi.fn(() => 'blob:created');
    revokeObjectURLMock = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      value: createObjectURLMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    delete (globalThis.URL as { createObjectURL?: unknown }).createObjectURL;
    delete (globalThis.URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  });

  it('does not request when user is missing', async () => {
    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'authenticated',
        user: undefined,
      })
    );
    await act(async () => {
      await result.current.fetchUserAvatar();
    });
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('loads blob URL when authenticated with user id', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    mockedSendRequest.mockResolvedValue(blob);

    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'authenticated',
        user: { id: 'user-1', image: 'https://session/img.png' },
      })
    );

    await waitFor(() => {
      expect(result.current.avatarSrc).toBe('blob:created');
    });
    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/api/v1/user/user-1/avatar',
      'GET'
    );
  });

  it('falls back to session image when GET fails', async () => {
    mockedSendRequest.mockRejectedValue(new Error('network'));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'authenticated',
        user: { id: 'u2', image: 'https://fallback' },
      })
    );

    await waitFor(() => {
      expect(result.current.avatarSrc).toBe('https://fallback');
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to null when GET fails and no session image', async () => {
    mockedSendRequest.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'authenticated',
        user: { id: 'u3' },
      })
    );

    await waitFor(() => {
      expect(result.current.avatarSrc).toBeNull();
    });
  });

  it('revokes previous blob URL on subsequent successful fetch', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    mockedSendRequest.mockResolvedValue(blob);

    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'unauthenticated',
        user: { id: 'u', image: null },
      })
    );

    await act(async () => {
      await result.current.fetchUserAvatar();
    });
    createObjectURLMock.mockReturnValue('blob:second');

    await act(async () => {
      await result.current.fetchUserAvatar();
    });

    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  it('uses me when user id omitted but fetchUserAvatar invoked manually', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    mockedSendRequest.mockResolvedValue(blob);

    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'authenticated',
        user: { image: 'https://x' },
      })
    );

    await act(async () => {
      await result.current.fetchUserAvatar();
    });

    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/api/v1/user/me/avatar',
      'GET'
    );
  });

  it('exposes setAvatarSrc', async () => {
    const { result } = renderHook(() =>
      useProfileAvatar({
        status: 'unauthenticated',
        user: undefined,
      })
    );

    act(() => {
      result.current.setAvatarSrc('https://manual');
    });
    expect(result.current.avatarSrc).toBe('https://manual');
  });
});
