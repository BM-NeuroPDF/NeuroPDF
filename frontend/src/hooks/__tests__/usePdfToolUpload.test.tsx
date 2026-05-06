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
});
