import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useProcessedFileActions } from '@/hooks/useProcessedFileActions';

const sendRequestMock = vi.fn();

vi.mock('@/utils/api', () => ({
  sendRequest: (...args: unknown[]) => sendRequestMock(...args),
}));

describe('useProcessedFileActions', () => {
  const onError = vi.fn();
  const savePdf = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveProcessed posts form data and updates context file', async () => {
    sendRequestMock.mockResolvedValue({ size_kb: 12 });
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: { user: { email: 'a@a.com' } } as never,
        savePdf,
        onError,
      }),
    );

    await act(async () => {
      await result.current.saveProcessed({
        blob: new Blob(['x'], { type: 'application/pdf' }),
        filename: 'out.pdf',
      });
    });

    expect(sendRequestMock).toHaveBeenCalledWith(
      '/files/save-processed',
      'POST',
      expect.any(FormData),
      true,
    );
    expect(savePdf).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does nothing when session is missing', async () => {
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: null,
        savePdf,
        onError,
      }),
    );

    await act(async () => {
      const out = await result.current.saveProcessed({
        blob: new Blob(['x']),
        filename: 'out.pdf',
      });
      expect(out).toBeNull();
    });
    expect(sendRequestMock).not.toHaveBeenCalled();
  });
});
