import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { usePdfToolUpload } from '@/hooks/usePdfToolUpload';

const dropzoneState = {
  getRootProps: vi.fn(() => ({})),
  getInputProps: vi.fn(() => ({})),
  isDragActive: false,
};

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(() => dropzoneState),
}));

describe('usePdfToolUpload', () => {
  const onFilesAccepted = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts valid pdf files', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1000,
        onFilesAccepted,
        onError,
      }),
    );

    const file = new File(['pdf'], 'a.pdf', { type: 'application/pdf' });
    result.current.onDrop([file], []);

    expect(onFilesAccepted).toHaveBeenCalledWith([file]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('rejects oversized file', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1,
        onFilesAccepted,
        onError,
      }),
    );
    const file = new File(['12345'], 'a.pdf', { type: 'application/pdf' });
    result.current.onDrop([file], []);
    expect(onError).toHaveBeenCalledWith({ code: 'SIZE_EXCEEDED' });
  });

  it('returns PANEL_ERROR when panel file missing', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1000,
        onFilesAccepted,
        onError,
      }),
    );
    result.current.handleDropFromPanel(null);
    expect(onError).toHaveBeenCalledWith({ code: 'PANEL_ERROR' });
  });

  it('rejects file with invalid type from drop payload', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1000,
        onFilesAccepted,
        onError,
      }),
    );

    const file = new File(['txt'], 'a.txt', { type: 'text/plain' });
    result.current.onDrop([file], []);
    expect(onError).toHaveBeenCalledWith({ code: 'INVALID_TYPE' });
  });

  it('rejects too many files when maxFiles is exceeded', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1000,
        maxFiles: 1,
        onFilesAccepted,
        onError,
      }),
    );

    const a = new File(['a'], 'a.pdf', { type: 'application/pdf' });
    const b = new File(['b'], 'b.pdf', { type: 'application/pdf' });
    result.current.onDrop([a, b], []);
    expect(onError).toHaveBeenCalledWith({ code: 'MAX_FILES_EXCEEDED' });
  });

  it('maps dropzone rejection codes', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1000,
        onFilesAccepted,
        onError,
      }),
    );

    result.current.onDrop([], [{ errors: [{ code: 'file-invalid-type', message: 'bad type' }] } as never]);
    expect(onError).toHaveBeenLastCalledWith({ code: 'INVALID_TYPE' });

    result.current.onDrop([], [{ errors: [{ code: 'file-too-large', message: 'too large' }] } as never]);
    expect(onError).toHaveBeenLastCalledWith({ code: 'SIZE_EXCEEDED' });

    result.current.onDrop([], [{ errors: [{ code: 'too-many-files', message: 'too many' }] } as never]);
    expect(onError).toHaveBeenLastCalledWith({ code: 'MAX_FILES_EXCEEDED' });

    result.current.onDrop([], [{ errors: [{ code: 'something-else', message: 'custom' }] } as never]);
    expect(onError).toHaveBeenLastCalledWith({ code: 'CUSTOM', message: 'custom' });
  });

  it('accepts panel file and stops propagation', () => {
    const { result } = renderHook(() =>
      usePdfToolUpload({
        maxBytes: 1000,
        onFilesAccepted,
        onError,
      }),
    );
    const file = new File(['pdf'], 'panel.pdf', { type: 'application/pdf' });
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    result.current.handleDropFromPanel(file, { stopPropagation, preventDefault } as never);
    expect(onFilesAccepted).toHaveBeenCalledWith([file]);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
