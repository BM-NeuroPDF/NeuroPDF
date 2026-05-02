import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Session } from 'next-auth';
import { usePdfSummarize } from '../usePdfSummarize';
import { sendRequest } from '@/utils/api';
import { guestService } from '@/services/guestService';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

vi.mock('@/services/guestService', () => ({
  guestService: {
    incrementUsage: vi.fn(),
  },
}));

const mockedSendRequest = vi.mocked(sendRequest);
const mockedIncrementUsage = vi.mocked(guestService.incrementUsage);

function buildParams(
  overrides: Partial<Parameters<typeof usePdfSummarize>[0]> = {}
) {
  return {
    session: null as Session | null,
    status: 'unauthenticated' as const,
    file: null as File | null,
    setFile: vi.fn(),
    savePdf: vi.fn(),
    checkLimit: vi.fn().mockResolvedValue(true),
    showError: vi.fn(),
    t: ((k: string) => k) as Parameters<typeof usePdfSummarize>[0]['t'],
    maxBytes: 5 * 1024 * 1024,
    resetAudio: vi.fn(),
    setSessionId: vi.fn(),
    setIsChatActive: vi.fn(),
    setChatMessages: vi.fn(),
    setActiveSessionDbId: vi.fn(),
    loadChatSessions: vi.fn(),
    ...overrides,
  };
}

const pdfFile = new File(['%PDF-1.1'], 'doc.pdf', {
  type: 'application/pdf',
});

describe('usePdfSummarize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('initializes state', () => {
    const { result } = renderHook(() => usePdfSummarize(buildParams()));
    expect(result.current.userRole).toBeNull();
    expect(result.current.summary).toBe('');
    expect(result.current.summarizing).toBe(false);
    expect(result.current.errorType).toBe('NONE');
    expect(result.current.customErrorMsg).toBeNull();
  });

  it('fetches user role when authenticated', async () => {
    mockedSendRequest.mockResolvedValueOnce({ role: 'Pro User' });
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ session, status: 'authenticated' }))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedSendRequest).toHaveBeenCalledWith('/files/user/stats', 'GET');
    expect(result.current.userRole).toBe('Pro User');
  });

  it('does not fetch role when status is not authenticated', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    renderHook(() =>
      usePdfSummarize(buildParams({ session, status: 'loading' }))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('does not fetch role when authenticated but session is null', async () => {
    renderHook(() =>
      usePdfSummarize(buildParams({ session: null, status: 'authenticated' }))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('clears role on stats failure', async () => {
    mockedSendRequest.mockRejectedValueOnce(new Error('x'));
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ session, status: 'authenticated' }))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.userRole).toBeNull();
  });

  it('clearError resets error state', () => {
    const { result } = renderHook(() => usePdfSummarize(buildParams()));
    act(() => {
      result.current.setErrorType('INVALID_TYPE');
      result.current.setCustomErrorMsg('x');
    });
    act(() => {
      result.current.clearError();
    });
    expect(result.current.errorType).toBe('NONE');
    expect(result.current.customErrorMsg).toBeNull();
  });

  it('resetState updates file, clears summary and errors, calls resetAudio', () => {
    const setFile = vi.fn();
    const savePdf = vi.fn();
    const resetAudio = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ setFile, savePdf, resetAudio }))
    );
    act(() => {
      result.current.resetState(pdfFile);
    });
    expect(setFile).toHaveBeenCalledWith(pdfFile);
    expect(savePdf).toHaveBeenCalledWith(pdfFile);
    expect(result.current.summary).toBe('');
    expect(resetAudio).toHaveBeenCalled();
  });

  it('summarize sets UPLOAD_FIRST when file is null', async () => {
    const { result } = renderHook(() => usePdfSummarize(buildParams()));
    await act(async () => {
      await result.current.summarize();
    });
    expect(result.current.errorType).toBe('UPLOAD_FIRST');
    expect(mockedSendRequest).not.toHaveBeenCalledWith(
      '/files/summarize-guest',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('summarize returns when guest checkLimit is false', async () => {
    const checkLimit = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session: null,
          checkLimit,
        })
      )
    );
    await act(async () => {
      await result.current.summarize();
    });
    expect(checkLimit).toHaveBeenCalled();
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('summarize posts to guest endpoint and increments usage', async () => {
    mockedSendRequest.mockResolvedValueOnce({ summary: '# Hi' });
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session: null,
          status: 'unauthenticated',
        })
      )
    );
    await act(async () => {
      await result.current.summarize();
    });
    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/files/summarize-guest',
      'POST',
      expect.any(FormData),
      true
    );
    expect(result.current.summary).toBe('# Hi');
    expect(result.current.summarizing).toBe(false);
    expect(mockedIncrementUsage).toHaveBeenCalled();
  });

  it('summarize swallows incrementUsage errors', async () => {
    mockedSendRequest.mockResolvedValueOnce({ summary: 's' });
    mockedIncrementUsage.mockRejectedValueOnce(new Error('usage'));
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ file: pdfFile, session: null }))
    );
    await act(async () => {
      await result.current.summarize();
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('summarize uses auth endpoint when session exists', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest.mockResolvedValueOnce({ summary: 'auth' });
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
        })
      )
    );
    await act(async () => {
      await result.current.summarize();
    });
    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/files/summarize',
      'POST',
      expect.any(FormData),
      true
    );
    expect(mockedIncrementUsage).not.toHaveBeenCalled();
  });

  it('summarize sets SUMMARY_ERROR on failure', async () => {
    mockedSendRequest.mockRejectedValueOnce(new Error('api'));
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ file: pdfFile, session: null }))
    );
    await act(async () => {
      await result.current.summarize();
    });
    expect(result.current.errorType).toBe('SUMMARY_ERROR');
    expect(result.current.summarizing).toBe(false);
  });

  it('summarize throws path when response has no summary', async () => {
    mockedSendRequest.mockResolvedValueOnce({});
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ file: pdfFile, session: null }))
    );
    await act(async () => {
      await result.current.summarize();
    });
    expect(result.current.errorType).toBe('SUMMARY_ERROR');
  });

  it('starts chat session for Pro user when pdf_text returned', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({
        summary: 's',
        pdf_text: 'full text',
      })
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({
        session_id: 'sid',
        db_session_id: 'db1',
      });

    const setSessionId = vi.fn();
    const setChatMessages = vi.fn();
    const loadChatSessions = vi.fn();

    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
          setSessionId,
          setChatMessages,
          loadChatSessions,
        })
      )
    );

    await act(async () => {
      await result.current.summarize();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(setSessionId).toHaveBeenCalledWith('sid');
    expect(setChatMessages).toHaveBeenCalled();
    expect(loadChatSessions).toHaveBeenCalled();
  });

  it('skips chat when role is not Pro', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 't' })
      .mockResolvedValueOnce({ role: 'standard' });

    const setSessionId = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
          setSessionId,
        })
      )
    );

    await act(async () => {
      await result.current.summarize();
      await Promise.resolve();
    });

    expect(setSessionId).not.toHaveBeenCalled();
  });

  it('ignores chat errors that look like Pro/403 gate', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 't' })
      .mockResolvedValueOnce({ role: 'pro' })
      .mockRejectedValueOnce(new Error('403 Forbidden Pro'));

    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({ file: pdfFile, session, status: 'authenticated' })
      )
    );

    await act(async () => {
      await result.current.summarize();
      await Promise.resolve();
    });

    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns on generic chat session failure', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 't' })
      .mockResolvedValueOnce({ role: 'pro' })
      .mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({ file: pdfFile, session, status: 'authenticated' })
      )
    );

    await act(async () => {
      await result.current.summarize();
      await Promise.resolve();
    });

    expect(console.warn).toHaveBeenCalled();
  });

  it('shows popup for resolved error message via useMemo + effect', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => {
      result.current.setErrorType('INVALID_TYPE');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith('invalidFileType');
  });

  it('maps customErrorMsg to showError', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => {
      result.current.setCustomErrorMsg('custom');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith('custom');
  });

  it('maps SIZE_EXCEEDED with maxBytes in message', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError, maxBytes: 10 * 1024 * 1024 }))
    );
    act(() => {
      result.current.setErrorType('SIZE_EXCEEDED');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith(
      expect.stringContaining('fileSizeExceeded')
    );
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('10'));
  });

  it('maps PANEL_ERROR', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => result.current.setErrorType('PANEL_ERROR'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith('panelPdfError');
  });

  it('maps UPLOAD_FIRST', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => result.current.setErrorType('UPLOAD_FIRST'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith('uploadFirst');
  });

  it('maps SUMMARY_ERROR', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => result.current.setErrorType('SUMMARY_ERROR'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith('summarizeFailed');
  });

  it('maps AUDIO_ERROR', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => result.current.setErrorType('AUDIO_ERROR'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith(
      'Seslendirme servisine ulaşılamadı.'
    );
  });

  it('maps PDF_GEN_ERROR', async () => {
    const showError = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(buildParams({ showError }))
    );
    act(() => result.current.setErrorType('PDF_GEN_ERROR'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).toHaveBeenCalledWith(
      'PDF oluşturulurken hata meydana geldi.'
    );
  });

  it('does not call showError when error is NONE', async () => {
    const showError = vi.fn();
    renderHook(() => usePdfSummarize(buildParams({ showError })));
    await act(async () => {
      await Promise.resolve();
    });
    expect(showError).not.toHaveBeenCalled();
  });

  it('accepts pro user role variant', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 't' })
      .mockResolvedValueOnce({ role: 'pro user' })
      .mockResolvedValueOnce({ session_id: 'sid' });

    const setSessionId = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
          setSessionId,
        })
      )
    );

    await act(async () => {
      await result.current.summarize();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(setSessionId).toHaveBeenCalledWith('sid');
  });

  it('chat chain skips state when session_id missing', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 't' })
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({});

    const setSessionId = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
          setSessionId,
        })
      )
    );

    await act(async () => {
      await result.current.summarize();
      await Promise.resolve();
    });

    expect(setSessionId).not.toHaveBeenCalled();
  });

  it('skips start-from-text when post-summary stats role is not pro', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 'body' })
      .mockResolvedValueOnce({ role: 'standard' });

    const setSessionId = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
          setSessionId,
        })
      )
    );

    await act(async () => {
      await result.current.summarize();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setSessionId).not.toHaveBeenCalled();
    expect(mockedSendRequest).not.toHaveBeenCalledWith(
      '/files/chat/start-from-text',
      'POST',
      expect.anything()
    );
  });

  it('skips start-from-text when post-summary stats response is null', async () => {
    const session = { user: { name: 'A' }, expires: '1' } as Session;
    mockedSendRequest
      .mockResolvedValueOnce({ role: 'standard' })
      .mockResolvedValueOnce({ summary: 's', pdf_text: 'body' })
      .mockResolvedValueOnce(null);

    const setSessionId = vi.fn();
    const { result } = renderHook(() =>
      usePdfSummarize(
        buildParams({
          file: pdfFile,
          session,
          status: 'authenticated',
          setSessionId,
        })
      )
    );

    await act(async () => {
      await result.current.summarize();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setSessionId).not.toHaveBeenCalled();
  });
});
