import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMergePdf } from '@/hooks/useMergePdf';

const sendRequestMock = vi.fn();
const downloadBlobMock = vi.fn();
const saveProcessedMock = vi.fn();
const runWithGuestCheckMock = vi.fn();
const uploadHandleDropFromPanelMock = vi.fn();

let processedActionsOnError: ((error: unknown) => void) | undefined;

vi.mock('@/utils/api', () => ({
  sendRequest: (...args: unknown[]) => sendRequestMock(...args),
}));

vi.mock('@/app/config/fileLimits', () => ({
  getMaxUploadBytes: () => 10,
  getMaxMergeTotalBytes: () => 15,
}));

vi.mock('@/hooks/useGuestGatedAction', () => ({
  useGuestGatedAction: () => ({
    runWithGuestCheck: runWithGuestCheckMock,
  }),
}));

vi.mock('@/hooks/useProcessedFileActions', () => ({
  useProcessedFileActions: (opts: { onError: (error: unknown) => void }) => {
    processedActionsOnError = opts.onError;
    return {
      downloadBlob: downloadBlobMock,
      saveProcessed: saveProcessedMock,
      saving: false,
    };
  },
}));

vi.mock('@/hooks/usePdfToolUpload', () => ({
  usePdfToolUpload: (opts: {
    onFilesAccepted: (files: File[]) => void;
    onError: (error: { code: string; message?: string }) => void;
  }) => ({
    onDrop: (acceptedFiles: File[]) => {
      const first = acceptedFiles[0];
      if (first?.name === 'invalid.type') {
        opts.onError({ code: 'INVALID_TYPE' });
        return;
      }
      if (first?.name === 'too-big.pdf') {
        opts.onError({ code: 'SIZE_EXCEEDED' });
        return;
      }
      if (first?.name === 'panel.err.pdf') {
        opts.onError({ code: 'PANEL_ERROR' });
        return;
      }
      if (first?.name === 'custom.err.pdf') {
        opts.onError({ code: 'CUSTOM', message: 'custom-upload-error' });
        return;
      }
      if (first?.name === 'custom-bare.err.pdf') {
        opts.onError({ code: 'CUSTOM' });
        return;
      }
      opts.onFilesAccepted(acceptedFiles);
    },
    handleDropFromPanel: uploadHandleDropFromPanelMock,
    getRootProps: vi.fn(() => ({})),
    getInputProps: vi.fn(() => ({})),
    isDragActive: false,
  }),
}));

describe('useMergePdf', () => {
  const baseParams = {
    session: { user: { email: 'user@x.com' } } as never,
    status: 'authenticated' as const,
    panelPdfFile: null as File | null,
    savePdf: vi.fn(async () => {}),
    checkLimit: vi.fn(async () => true),
    t: ((key: string) => key) as never,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    processedActionsOnError = undefined;
    runWithGuestCheckMock.mockImplementation(async (action: () => Promise<void>) => action());
    saveProcessedMock.mockResolvedValue({ size_kb: 7 });
    sendRequestMock.mockResolvedValue(new Blob(['merged'], { type: 'application/pdf' }));
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useMergePdf(baseParams));
    expect(result.current.files).toEqual([]);
    expect(result.current.processedBlob).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.hasProcessed).toBe(false);
    expect(result.current.currentError).toBeNull();
  });

  it('updates files with handleSelect, removeFile and clearFiles', () => {
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bb'], 'b.pdf', { type: 'application/pdf' });

    const event = {
      target: { files: [a, b], value: 'x' },
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleSelect(event);
    });
    expect(result.current.files).toHaveLength(2);
    expect(result.current.isReady).toBe(true);
    expect(event.target.value).toBe('');

    act(() => {
      result.current.removeFile(0);
    });
    expect(result.current.files).toHaveLength(1);

    act(() => {
      result.current.clearFiles();
    });
    expect(result.current.files).toEqual([]);
    expect(result.current.hasProcessed).toBe(false);
  });

  it('sets minimum file error when merging with fewer than two files', async () => {
    const { result } = renderHook(() => useMergePdf(baseParams));
    await act(async () => {
      await result.current.handleMergePdfs();
    });
    expect(result.current.currentError).toBe('mergeMinFilesError');
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it('maps upload error codes to translated or custom error messages', () => {
    const { result } = renderHook(() => useMergePdf(baseParams));
    const mkEvent = (file: File) =>
      ({
        target: { files: [file], value: '' },
      }) as unknown as React.ChangeEvent<HTMLInputElement>;

    act(() => {
      result.current.handleSelect(mkEvent(new File(['x'], 'invalid.type', { type: 'text/plain' })));
    });
    expect(result.current.currentError).toBe('invalidFileType');

    act(() => {
      result.current.handleSelect(
        mkEvent(new File(['x'], 'too-big.pdf', { type: 'application/pdf' })),
      );
    });
    expect(result.current.currentError).toContain('fileSizeExceeded');

    act(() => {
      result.current.handleSelect(
        mkEvent(new File(['x'], 'panel.err.pdf', { type: 'application/pdf' })),
      );
    });
    expect(result.current.currentError).toBe('panelPdfError');

    act(() => {
      result.current.handleSelect(
        mkEvent(new File(['x'], 'custom.err.pdf', { type: 'application/pdf' })),
      );
    });
    expect(result.current.currentError).toBe('custom-upload-error');

    act(() => {
      result.current.handleSelect(
        mkEvent(new File(['x'], 'custom-bare.err.pdf', { type: 'application/pdf' })),
      );
    });
    expect(result.current.currentError).toBeNull();
  });

  it('sets total size exceeded when selecting files beyond aggregate limit', () => {
    const { result } = renderHook(() => useMergePdf(baseParams));
    const first = new File(['1234567890'], 'first.pdf', { type: 'application/pdf' });
    const second = new File(['123456'], 'second.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [first], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      result.current.handleSelect({
        target: { files: [second], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.currentError).toContain('totalSizeExceeded');
  });

  it('merges successfully and enables download', async () => {
    const savePdf = vi.fn(async () => {});
    const { result } = renderHook(() => useMergePdf({ ...baseParams, savePdf }));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleMergePdfs();
    });

    expect(runWithGuestCheckMock).toHaveBeenCalledTimes(1);
    expect(sendRequestMock).toHaveBeenCalledWith(
      '/files/merge-pdfs',
      'POST',
      expect.any(FormData),
      true,
    );
    expect(savePdf).toHaveBeenCalledTimes(1);
    expect(result.current.hasProcessed).toBe(true);

    act(() => {
      result.current.handleDownload();
    });
    expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'merged.pdf');
  });

  it('sets merge error when merged blob is empty', async () => {
    sendRequestMock.mockResolvedValue(new Blob([], { type: 'application/pdf' }));
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleMergePdfs();
    });
    expect(result.current.currentError).toBe('unknownMergeError');
  });

  it('sets merge error when API fails', async () => {
    sendRequestMock.mockRejectedValue(new Error('merge failed'));
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleMergePdfs();
    });
    expect(result.current.currentError).toBe('unknownMergeError');
  });

  it('validates panel drop edge cases', () => {
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    const { result: noPanel } = renderHook(() => useMergePdf(baseParams));
    act(() => {
      noPanel.current.handleDropFromPanel();
    });
    expect(noPanel.current.currentError).toBe('panelPdfError');

    const invalidType = new File(['x'], 'x.txt', { type: 'text/plain' });
    const { result: invalidTypeResult } = renderHook(() =>
      useMergePdf({ ...baseParams, panelPdfFile: invalidType }),
    );
    act(() => {
      invalidTypeResult.current.handleDropFromPanel();
    });
    expect(invalidTypeResult.current.currentError).toBe('invalidFileType');

    const oversized = new File(['01234567890'], 'big.pdf', { type: 'application/pdf' });
    const { result: oversizedResult } = renderHook(() =>
      useMergePdf({ ...baseParams, panelPdfFile: oversized }),
    );
    act(() => {
      oversizedResult.current.handleDropFromPanel();
    });
    expect(oversizedResult.current.currentError).toContain('fileSizeExceeded');

    const panelTooLargeTotal = new File(['123456789'], 'panel.pdf', { type: 'application/pdf' });
    const { result: totalSizeResult } = renderHook(() =>
      useMergePdf({ ...baseParams, panelPdfFile: panelTooLargeTotal }),
    );
    act(() => {
      totalSizeResult.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      totalSizeResult.current.handleDropFromPanel();
    });
    expect(totalSizeResult.current.currentError).toContain('totalSizeExceeded');

    const duplicate = new File(['same'], 'dup.pdf', { type: 'application/pdf' });
    const { result: duplicateResult } = renderHook(() =>
      useMergePdf({ ...baseParams, panelPdfFile: duplicate }),
    );
    act(() => {
      duplicateResult.current.handleSelect({
        target: { files: [duplicate], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    act(() => {
      duplicateResult.current.handleDropFromPanel();
    });
    expect(duplicateResult.current.currentError).toBe('"dup.pdf" fileAlreadyInList');
  });

  it('delegates valid panel file to upload hook helper', () => {
    const panel = new File(['ok'], 'ok.pdf', { type: 'application/pdf' });
    const { result } = renderHook(() => useMergePdf({ ...baseParams, panelPdfFile: panel }));

    act(() => {
      result.current.handleDropFromPanel();
    });

    expect(uploadHandleDropFromPanelMock).toHaveBeenCalledWith(panel, undefined);
  });

  it('does not merge when guest gate blocks the action', async () => {
    runWithGuestCheckMock.mockImplementation(async () => {});
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await result.current.handleMergePdfs();
    });
    expect(sendRequestMock).not.toHaveBeenCalled();
    expect(result.current.hasProcessed).toBe(false);
  });

  it('returns early for download/save when blob or session is missing', async () => {
    const { result: noBlob } = renderHook(() => useMergePdf(baseParams));
    act(() => {
      noBlob.current.handleDownload();
    });
    expect(downloadBlobMock).not.toHaveBeenCalled();
    await act(async () => {
      await noBlob.current.handleSave();
    });
    expect(saveProcessedMock).not.toHaveBeenCalled();

    const { result: noSession } = renderHook(() =>
      useMergePdf({ ...baseParams, session: null, status: 'unauthenticated' }),
    );
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });
    act(() => {
      noSession.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await noSession.current.handleMergePdfs();
    });
    await act(async () => {
      await noSession.current.handleSave();
    });
    expect(saveProcessedMock).not.toHaveBeenCalled();
  });

  it('keeps files when saveProcessed returns null', async () => {
    saveProcessedMock.mockResolvedValueOnce(null);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });
    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await result.current.handleMergePdfs();
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.files).toHaveLength(2);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('handles save success and resets files', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleMergePdfs();
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(saveProcessedMock).toHaveBeenCalledWith({
      blob: expect.any(Blob),
      filename: 'merged.pdf',
      mimeType: 'application/pdf',
    });
    expect(alertSpy).toHaveBeenCalledWith('saveSuccess\nfileSize: 7 KB');
    expect(result.current.files).toEqual([]);
    alertSpy.mockRestore();
  });

  it('sets save error when processed action reports failure', async () => {
    saveProcessedMock.mockImplementation(async () => {
      processedActionsOnError?.(new Error('save failed'));
      throw new Error('save failed');
    });
    const { result } = renderHook(() => useMergePdf(baseParams));
    const a = new File(['aaaa'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['bbbb'], 'b.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.handleSelect({
        target: { files: [a, b], value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await result.current.handleMergePdfs();
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.currentError).toBe('saveError');
  });
});
