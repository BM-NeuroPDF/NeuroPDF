import { act, renderHook, waitFor } from '@testing-library/react';
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

  it('saveProcessed omits savePdf when hook has no savePdf callback', async () => {
    sendRequestMock.mockResolvedValue({ size_kb: 1 });
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: { user: { email: 'b@b.com' } } as never,
        onError,
      }),
    );

    await act(async () => {
      await result.current.saveProcessed({
        blob: new Blob(['y'], { type: 'application/pdf' }),
        filename: 'only.pdf',
      });
    });

    expect(sendRequestMock).toHaveBeenCalled();
    expect(savePdf).not.toHaveBeenCalled();
  });

  it('saveProcessed uses custom mimeType for File', async () => {
    sendRequestMock.mockResolvedValue({});
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: { user: {} } as never,
        onError,
      }),
    );

    await act(async () => {
      await result.current.saveProcessed({
        blob: new Blob(['z']),
        filename: 'custom.bin',
        mimeType: 'application/octet-stream',
      });
    });

    const formData = sendRequestMock.mock.calls[0][2] as FormData;
    const file = formData.get('file') as File;
    expect(file.type).toBe('application/octet-stream');
  });

  it('saveProcessed calls onError and returns null when sendRequest rejects', async () => {
    sendRequestMock.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: { user: {} } as never,
        onError,
      }),
    );

    await act(async () => {
      const out = await result.current.saveProcessed({
        blob: new Blob(['e']),
        filename: 'fail.pdf',
      });
      expect(out).toBeNull();
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('sets saving true until saveProcessed completes', async () => {
    let resolveSave!: (value: unknown) => void;
    sendRequestMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: { user: {} } as never,
        onError,
      }),
    );

    const p = result.current.saveProcessed({
      blob: new Blob(['x']),
      filename: 'wait.pdf',
    });

    await waitFor(() => expect(result.current.saving).toBe(true));
    await act(async () => {
      resolveSave({});
      await p;
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  it('propagates savePdf failure to onError after successful upload', async () => {
    sendRequestMock.mockResolvedValue({ size_kb: 1 });
    const badSave = vi.fn().mockRejectedValue(new Error('context-save'));
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: { user: {} } as never,
        savePdf: badSave,
        onError,
      }),
    );

    await act(async () => {
      const out = await result.current.saveProcessed({
        blob: new Blob(['z']),
        filename: 'ctx.pdf',
      });
      expect(out).toBeNull();
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(badSave).toHaveBeenCalled();
  });

  it('reset clears saving state and invokes clearProcessed when provided', () => {
    const clearProcessed = vi.fn();
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: null,
        onError,
      }),
    );

    act(() => {
      result.current.reset(clearProcessed);
    });

    expect(clearProcessed).toHaveBeenCalledTimes(1);
  });

  it('reset works without clearProcessed', () => {
    const { result } = renderHook(() =>
      useProcessedFileActions({
        session: null,
        onError,
      }),
    );

    expect(() =>
      act(() => {
        result.current.reset();
      }),
    ).not.toThrow();
  });

  it('downloadBlob creates a temporary link, clicks, then revokes URL', () => {
    const realCreateElement = document.createElement.bind(document);
    const blob = new Blob(['hello']);
    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement;

    const prevCreateObjectURL = window.URL.createObjectURL?.bind(window.URL);
    const prevRevokeObjectURL = window.URL.revokeObjectURL?.bind(window.URL);

    const urlSpyCreate = vi.fn(() => 'blob:test-url');
    const urlSpyRevoke = vi.fn();
    window.URL.createObjectURL = urlSpyCreate as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = urlSpyRevoke as typeof window.URL.revokeObjectURL;

    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        if (tag === 'a') return anchor as unknown as HTMLElement;
        return realCreateElement(tag as keyof HTMLElementTagNameMap, options);
      });
    const appendSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node: Node) => node);
    const removeSpy = vi
      .spyOn(document.body, 'removeChild')
      .mockImplementation((node: Node) => node);

    try {
      const { result } = renderHook(() =>
        useProcessedFileActions({
          session: null,
          onError,
        }),
      );

      act(() => {
        result.current.downloadBlob(blob, 'doc.pdf');
      });

      expect(urlSpyCreate).toHaveBeenCalledWith(blob);
      expect(anchor.download).toBe('doc.pdf');
      expect(anchor.href).toBe('blob:test-url');
      expect(click).toHaveBeenCalledTimes(1);
      expect(urlSpyRevoke).toHaveBeenCalledWith('blob:test-url');
      expect(removeSpy).toHaveBeenCalledWith(anchor);
    } finally {
      createSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
      if (prevCreateObjectURL) window.URL.createObjectURL = prevCreateObjectURL;
      else delete (window.URL as Partial<typeof URL>).createObjectURL;
      if (prevRevokeObjectURL) window.URL.revokeObjectURL = prevRevokeObjectURL;
      else delete (window.URL as Partial<typeof URL>).revokeObjectURL;
    }
  });
});
