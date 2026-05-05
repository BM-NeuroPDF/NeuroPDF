import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect } from 'react';
import { useEditPdf } from '../useEditPdf';

const { sessionRef } = vi.hoisted(() => ({
  sessionRef: {
    data: null as { user?: string } | null,
    status: 'unauthenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  },
}));

const mockSavePdf = vi.fn();
const mockCheckLimit = vi.fn();
const mockReorderPdfPages = vi.fn();
const mockSaveReordered = vi.fn();
const mockShowError = vi.fn();
const mockIncrementUsage = vi.fn();

vi.mock('../useEditPdfApi', () => ({
  reorderPdfPages: (...a: unknown[]) => mockReorderPdfPages(...a),
  saveReorderedPdfToServer: (...a: unknown[]) => mockSaveReordered(...a),
}));

vi.mock('@/services/guestService', () => ({
  guestService: {
    incrementUsage: () => mockIncrementUsage(),
  },
}));

vi.mock('@/context/PdfContext', () => ({
  usePdfData: () => ({
    pdfFile: null,
    refreshKey: 0,
  }),
  usePdfActions: () => ({
    savePdf: mockSavePdf,
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/edit-pdf',
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: sessionRef.data,
    status: sessionRef.status,
  }),
}));

vi.mock('@/hooks/useGuestLimit', () => ({
  useGuestLimit: () => ({
    usageInfo: null,
    showLimitModal: false,
    checkLimit: () => mockCheckLimit(),
    closeLimitModal: vi.fn(),
    redirectToLogin: vi.fn(),
  }),
}));

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/usePopup', () => ({
  usePopup: () => ({
    popup: { open: false, type: 'info' as const, message: '' },
    showError: mockShowError,
    close: vi.fn(),
  }),
}));

function HookProbe({ onReady }: { onReady?: (h: ReturnType<typeof useEditPdf>) => void }) {
  const h = useEditPdf();
  useEffect(() => {
    onReady?.(h);
  }, [h, onReady]);
  return (
    <>
      <div data-testid="root" {...h.getRootProps()}>
        <input data-testid="dz" {...h.getInputProps()} />
      </div>
      <button
        type="button"
        data-testid="load-success"
        onClick={() => h.handleLoadSuccess({ numPages: 1 })}
      >
        load
      </button>
      <button type="button" data-testid="process" onClick={() => void h.handleProcessAndDownload()}>
        process
      </button>
      <button type="button" data-testid="reset" onClick={h.handleReset}>
        reset
      </button>
      <button type="button" data-testid="save" onClick={() => void h.handleSave()}>
        save
      </button>
    </>
  );
}

describe('useEditPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionRef.data = null;
    sessionRef.status = 'unauthenticated';
    mockCheckLimit.mockResolvedValue(true);
    mockReorderPdfPages.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    mockSaveReordered.mockResolvedValue({ size_kb: 9 });
    mockIncrementUsage.mockResolvedValue(undefined);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-test'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('opens popup when processing without a file', async () => {
    const user = userEvent.setup();
    render(<HookProbe />);
    await user.click(screen.getByTestId('process'));
    expect(mockShowError).toHaveBeenCalledWith('selectPdfFirst');
  });

  it('reorders, saves to context, and increments guest usage after upload', async () => {
    const user = userEvent.setup();
    const pdf = new File(['%PDF-1'], 'doc.pdf', { type: 'application/pdf' });
    render(<HookProbe />);
    await user.upload(screen.getByTestId('dz'), pdf);
    await user.click(screen.getByTestId('load-success'));
    await user.click(screen.getByTestId('process'));

    await waitFor(() => {
      expect(mockReorderPdfPages).toHaveBeenCalled();
    });
    expect(mockSavePdf).toHaveBeenCalled();
    expect(mockIncrementUsage).toHaveBeenCalled();
  });

  it('sets EMPTY_PDF when reorder returns an empty blob', async () => {
    const user = userEvent.setup();
    mockReorderPdfPages.mockResolvedValue(new Blob([], { type: 'application/pdf' }));
    const pdf = new File(['%PDF-1'], 'doc.pdf', { type: 'application/pdf' });
    render(<HookProbe />);
    await user.upload(screen.getByTestId('dz'), pdf);
    await user.click(screen.getByTestId('load-success'));
    await user.click(screen.getByTestId('process'));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('emptyPdfError');
    });
  });

  it('saves processed PDF when authenticated', async () => {
    const user = userEvent.setup();
    sessionRef.data = { user: 'u1' };
    sessionRef.status = 'authenticated';
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const pdf = new File(['%PDF-1'], 'doc.pdf', { type: 'application/pdf' });
    render(<HookProbe />);
    await user.upload(screen.getByTestId('dz'), pdf);
    await user.click(screen.getByTestId('load-success'));
    await user.click(screen.getByTestId('process'));

    await waitFor(() => {
      expect(mockReorderPdfPages).toHaveBeenCalled();
    });

    await user.click(screen.getByTestId('save'));

    await waitFor(() => {
      expect(mockSaveReordered).toHaveBeenCalled();
    });
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
