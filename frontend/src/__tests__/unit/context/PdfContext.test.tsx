import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';

vi.mock('@/utils/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/utils/api')>();
  return {
    ...mod,
    fetchChatSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    fetchSessionMessages: vi.fn(),
    resumeChatSession: vi.fn(),
    fetchStoredPdfBlob: vi.fn(),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { PdfProvider, usePdf } from '@/context/PdfContext';
import * as api from '@/utils/api';

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
      session={null}
    >
      <PdfProvider>{children}</PdfProvider>
    </SessionProvider>
  );
}

function AuthTestProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={0}
      refetchOnWindowFocus={false}
      session={
        {
          user: { name: 'Auth User', email: 'a@b.com' },
          expires: '2099-12-31',
        } as any
      }
    >
      <PdfProvider>{children}</PdfProvider>
    </SessionProvider>
  );
}

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Helper function to create a mock PDF File
function createMockPdfFile(name = 'test.pdf', size = 1024): File {
  const blob = new Blob(['mock pdf content'], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

// Helper function to create base64 string from File
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

describe('PdfContext', () => {
  beforeEach(() => {
    // Her test öncesi sessionStorage'ı temizle
    sessionStorageMock.clear();
    vi.clearAllMocks();
    vi.mocked(api.fetchChatSessions).mockResolvedValue({ sessions: [] });
  });

  describe('Initial State', () => {
    it('should initialize with null pdfFile', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      expect(result.current.pdfFile).toBeNull();
      expect(result.current.pdfList).toEqual([]);
      expect(result.current.refreshKey).toBe(0);
      expect(result.current.chatMessages).toEqual([]);
      expect(result.current.isChatActive).toBe(false);
      expect(result.current.sessionId).toBeNull();
    });

    it('should restore PDF from sessionStorage on mount', async () => {
      const mockFile = createMockPdfFile('restored.pdf');
      const base64 = await fileToBase64(mockFile);
      sessionStorageMock.setItem('activePdfBase64', base64);

      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull();
      });

      expect(result.current.pdfFile?.name).toBe('restored_document.pdf');
      expect(result.current.pdfList).toHaveLength(1);
    });
  });

  describe('savePdf', () => {
    it('should save a PDF file and update state', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const mockFile = createMockPdfFile('document.pdf');

      await act(async () => {
        await result.current.savePdf(mockFile);
      });

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull();
      });

      expect(result.current.pdfFile?.name).toBe('document.pdf');
      expect(result.current.pdfList).toHaveLength(1);
      expect(result.current.pdfList[0]?.name).toBe('document.pdf');
      await waitFor(() => {
        expect(result.current.refreshKey).toBeGreaterThan(0);
      });
      expect(sessionStorageMock.getItem('activePdfBase64')).toBeTruthy();
    });

    it('should clear PDF when null is passed', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const mockFile = createMockPdfFile('document.pdf');

      // Önce bir dosya kaydet
      await act(async () => {
        await result.current.savePdf(mockFile);
      });

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull();
      });

      // Sonra null ile temizle
      await act(async () => {
        await result.current.savePdf(null);
      });

      expect(result.current.pdfFile).toBeNull();
      expect(result.current.pdfList).toEqual([]);
      expect(result.current.isChatActive).toBe(false);
      expect(result.current.chatMessages).toEqual([]);
      expect(result.current.sessionId).toBeNull();
      expect(sessionStorageMock.getItem('activePdfBase64')).toBeNull();
    });

    it('should increment refreshKey when saving a new file', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const initialRefreshKey = result.current.refreshKey;
      const mockFile = createMockPdfFile('document.pdf');

      await act(async () => {
        await result.current.savePdf(mockFile);
      });

      await waitFor(() => {
        expect(result.current.refreshKey).toBeGreaterThan(initialRefreshKey);
      });
    });

    it('should handle files without slice method gracefully', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const invalidFile = {
        name: 'invalid.pdf',
        size: 1024,
        type: 'application/pdf',
      } as unknown as File;

      await act(async () => {
        await result.current.savePdf(invalidFile);
      });

      // Should not throw and should resolve
      expect(result.current.pdfFile).toBeNull();
      expect(result.current.pdfList).toEqual([]);
    });
  });

  describe('addPdfs / removePdf / setActivePdf', () => {
    it('addPdfs appends unique PDFs and sets first as active when list was empty', () => {
      const { result } = renderHook(() => usePdf(), { wrapper: TestProviders });
      const a = createMockPdfFile('a.pdf');
      const b = createMockPdfFile('b.pdf');

      act(() => {
        result.current.addPdfs([a, b]);
      });

      expect(result.current.pdfList).toHaveLength(2);
      expect(result.current.pdfFile?.name).toBe('a.pdf');
    });

    it('addPdfs skips duplicate file names', () => {
      const { result } = renderHook(() => usePdf(), { wrapper: TestProviders });
      const a1 = createMockPdfFile('same.pdf');
      const a2 = createMockPdfFile('same.pdf');

      act(() => {
        result.current.addPdfs([a1]);
      });
      act(() => {
        result.current.addPdfs([a2]);
      });

      expect(result.current.pdfList).toHaveLength(1);
    });

    it('setActivePdf switches active file', () => {
      const { result } = renderHook(() => usePdf(), { wrapper: TestProviders });
      const a = createMockPdfFile('a.pdf');
      const b = createMockPdfFile('b.pdf');

      act(() => {
        result.current.addPdfs([a, b]);
      });
      act(() => {
        result.current.setActivePdf('b.pdf');
      });

      expect(result.current.pdfFile?.name).toBe('b.pdf');
    });

    it('removePdf removes file and picks new active when removing active', () => {
      const { result } = renderHook(() => usePdf(), { wrapper: TestProviders });
      const a = createMockPdfFile('a.pdf');
      const b = createMockPdfFile('b.pdf');

      act(() => {
        result.current.addPdfs([a, b]);
      });
      act(() => {
        result.current.setActivePdf('a.pdf');
      });
      act(() => {
        result.current.removePdf('a.pdf');
      });

      expect(result.current.pdfList).toHaveLength(1);
      expect(result.current.pdfFile?.name).toBe('b.pdf');
    });
  });

  describe('clearPdf', () => {
    it('should clear PDF file and reset chat state', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const mockFile = createMockPdfFile('document.pdf');

      // Önce bir dosya kaydet
      await act(async () => {
        await result.current.savePdf(mockFile);
      });

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull();
      });

      // Chat state'lerini ayarla
      act(() => {
        result.current.setIsChatActive(true);
        result.current.setChatMessages([{ role: 'user', content: 'Hello' }]);
        result.current.setSessionId('session-123');
      });

      // clearPdf'i çağır
      act(() => {
        result.current.clearPdf();
      });

      expect(result.current.pdfFile).toBeNull();
      expect(result.current.pdfList).toEqual([]);
      expect(result.current.isChatActive).toBe(false);
      expect(result.current.chatMessages).toEqual([]);
      expect(result.current.sessionId).toBeNull();
      expect(sessionStorageMock.getItem('activePdfBase64')).toBeNull();
    });

    it('should increment refreshKey when clearing PDF', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const mockFile = createMockPdfFile('document.pdf');

      await act(async () => {
        await result.current.savePdf(mockFile);
      });

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull();
      });

      const refreshKeyBeforeClear = result.current.refreshKey;

      act(() => {
        result.current.clearPdf();
      });

      expect(result.current.refreshKey).toBeGreaterThan(refreshKeyBeforeClear);
    });
  });

  describe('triggerRefresh', () => {
    it('should increment refreshKey', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const initialRefreshKey = result.current.refreshKey;

      act(() => {
        result.current.triggerRefresh();
      });

      expect(result.current.refreshKey).toBe(initialRefreshKey + 1);
    });

    it('should increment refreshKey multiple times', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      act(() => {
        result.current.triggerRefresh();
        result.current.triggerRefresh();
        result.current.triggerRefresh();
      });

      expect(result.current.refreshKey).toBe(3);
    });
  });

  describe('Chat State Management', () => {
    it('should manage chatMessages state', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      const newMessages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ];

      act(() => {
        result.current.setChatMessages(newMessages);
      });

      expect(result.current.chatMessages).toEqual(newMessages);
    });

    it('should manage isChatActive state', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      expect(result.current.isChatActive).toBe(false);

      act(() => {
        result.current.setIsChatActive(true);
      });

      expect(result.current.isChatActive).toBe(true);

      act(() => {
        result.current.setIsChatActive(false);
      });

      expect(result.current.isChatActive).toBe(false);
    });

    it('should manage sessionId state', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      expect(result.current.sessionId).toBeNull();

      act(() => {
        result.current.setSessionId('session-123');
      });

      expect(result.current.sessionId).toBe('session-123');

      act(() => {
        result.current.setSessionId(null);
      });

      expect(result.current.sessionId).toBeNull();
    });

    it('should reset chat state when PDF is cleared', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      // Chat state'lerini ayarla
      act(() => {
        result.current.setIsChatActive(true);
        result.current.setChatMessages([{ role: 'user', content: 'Test' }]);
        result.current.setSessionId('session-123');
      });

      // PDF'i temizle
      act(() => {
        result.current.clearPdf();
      });

      expect(result.current.isChatActive).toBe(false);
      expect(result.current.chatMessages).toEqual([]);
      expect(result.current.sessionId).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle sessionStorage errors gracefully', async () => {
      // sessionStorage.getItem'ı mock'la ve hata fırlat
      const originalGetItem = sessionStorageMock.getItem;
      sessionStorageMock.getItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      // useEffect'in çalışması için bekle
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
      sessionStorageMock.getItem = originalGetItem;
    });

    it('should handle large PDF files that cannot be stored', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });

      // sessionStorage.setItem'ı mock'la ve hata fırlat
      const originalSetItem = sessionStorageMock.setItem;
      sessionStorageMock.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const mockFile = createMockPdfFile('large.pdf');

      await act(async () => {
        await result.current.savePdf(mockFile);
      });

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull();
      });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalled();
      });

      consoleWarnSpy.mockRestore();
      sessionStorageMock.setItem = originalSetItem;
    });
  });

  describe('Authenticated restoreSession', () => {
    it('hydrates chat and loads stored PDF', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({
        messages: [{ role: 'user', content: 'hello' }],
      });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: 'pdf-1',
        db_session_id: 'db1',
        filename: 'report.pdf',
      });
      vi.mocked(api.fetchStoredPdfBlob).mockResolvedValue(
        new Blob(['%PDF'], { type: 'application/pdf' })
      );

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-1');
      });

      expect(result.current.sessionId).toBe('sid');
      expect(
        result.current.chatMessages.some((m) => m.content.includes('hello'))
      ).toBe(true);
      expect(api.fetchStoredPdfBlob).toHaveBeenCalledWith('pdf-1');
      expect(toast.success).toHaveBeenCalled();
    });

    it('shows welcome assistant message when history empty', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({ messages: [] });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: null,
        db_session_id: 'db1',
        filename: '  doc  ',
      });

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-2');
      });

      expect(
        result.current.chatMessages.some((m) => m.content.includes('Merhaba'))
      ).toBe(true);
    });

    it('appends .pdf to filename when extension missing', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({
        messages: [{ role: 'user', content: 'x' }],
      });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: 'pid',
        db_session_id: 'db1',
        filename: 'noext',
      });
      vi.mocked(api.fetchStoredPdfBlob).mockResolvedValue(
        new Blob(['%PDF'], { type: 'application/pdf' })
      );

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-ext');
      });

      expect(result.current.pdfFile?.name).toBe('noext.pdf');
    });

    it('toast message when stored PDF blob fails', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({
        messages: [{ role: 'user', content: 'x' }],
      });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: 'pid',
        db_session_id: 'db1',
        filename: 'a.pdf',
      });
      vi.mocked(api.fetchStoredPdfBlob).mockRejectedValue(new Error('blob'));

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-3');
      });

      expect(toast.message).toHaveBeenCalled();
    });

    it('toast error when restore fails', async () => {
      vi.mocked(api.fetchSessionMessages).mockRejectedValue(new Error('nope'));

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('bad');
      });

      expect(toast.error).toHaveBeenCalledWith('nope');
    });

    it('savePdf no-ops for invalid file object', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.savePdf({ name: 'bad' } as File);
      });

      expect(result.current.pdfFile).toBeNull();
    });

    it('saveExistingPdf no-ops when slice missing', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.saveExistingPdf({ name: 'bad' } as File, 'doc-1');
      });
    });

    it('saveExistingPdf sets document id for valid file', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });
      const f = createMockPdfFile('ok.pdf');
      await act(async () => {
        await result.current.saveExistingPdf(f, 'doc-xyz');
      });
      expect(result.current.existingDocumentId).toBe('doc-xyz');
    });

    it('loadChatSessions clears sessions when API fails', async () => {
      vi.mocked(api.fetchChatSessions).mockRejectedValueOnce(new Error('fail'));
      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });
      await waitFor(() => {
        expect(result.current.chatSessions).toEqual([]);
      });
    });

    it('loadChatSessions returns early when not authenticated', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });
      await act(async () => {
        await result.current.loadChatSessions();
      });
      expect(result.current.chatSessions).toEqual([]);
    });

    it('loadChatSessions normalizes null sessions from API', async () => {
      vi.mocked(api.fetchChatSessions).mockResolvedValue({
        sessions: null,
      } as any);

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.loadChatSessions();
      });

      expect(result.current.chatSessions).toEqual([]);
    });

    it('throws when usePdf is used outside PdfProvider', () => {
      expect(() => renderHook(() => usePdf())).toThrow(
        /usePdf must be used within a PdfProvider/
      );
    });

    it('addPdfs with empty array does not change pdf list', async () => {
      const f = createMockPdfFile('only.pdf');
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });
      await act(async () => {
        await result.current.savePdf(f);
      });
      const before = result.current.pdfList.length;
      await act(async () => {
        result.current.addPdfs([]);
      });
      expect(result.current.pdfList.length).toBe(before);
    });

    it('setActivePdf does nothing when filename is not in list', async () => {
      const f = createMockPdfFile('only.pdf');
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });
      await act(async () => {
        await result.current.savePdf(f);
      });
      const before = result.current.pdfFile?.name;
      await act(async () => {
        result.current.setActivePdf('nope.pdf');
      });
      expect(result.current.pdfFile?.name).toBe(before);
    });

    it('restoreSession handles API response without messages field', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({} as any);
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: null,
        db_session_id: 'db1',
        filename: 'doc.pdf',
      });

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-no-msg');
      });

      expect(result.current.chatMessages.length).toBeGreaterThan(0);
    });

    it('restoreSession uses document.pdf when stored PDF has no filename', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({
        messages: [{ role: 'user', content: 'x' }],
      });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: 'pid',
        db_session_id: 'db1',
        filename: undefined,
      });
      vi.mocked(api.fetchStoredPdfBlob).mockResolvedValue(
        new Blob(['%PDF'], { type: 'application/pdf' })
      );

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-no-fname');
      });

      expect(result.current.pdfFile?.name).toBe('document.pdf');
    });

    it('restoreSession uses generic toast when rejection is not an Error', async () => {
      vi.mocked(api.fetchSessionMessages).mockRejectedValue('string-fail');

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-err');
      });

      expect(toast.error).toHaveBeenCalledWith('Oturum yüklenemedi.');
    });

    it('restoreSession filters system role and null content messages', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({
        messages: [
          { role: 'system', content: 'skip' },
          { role: 'user', content: null as unknown as string },
          { role: 'assistant', content: 'keep' },
        ],
      });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: null,
        db_session_id: 'db1',
        filename: 'doc.pdf',
      });

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-filter');
      });

      expect(result.current.chatMessages).toEqual([
        { role: 'assistant', content: 'keep' },
      ]);
    });

    it('restoreSession uses default filename when resume filename is whitespace', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({ messages: [] });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: null,
        db_session_id: 'db1',
        filename: '   ',
      });

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-trim');
      });

      expect(
        result.current.chatMessages.some((m) =>
          m.content.includes('document.pdf')
        )
      ).toBe(true);
    });

    it('restoreSession keeps filename when it already ends with .pdf', async () => {
      vi.mocked(api.fetchSessionMessages).mockResolvedValue({
        messages: [{ role: 'user', content: 'x' }],
      });
      vi.mocked(api.resumeChatSession).mockResolvedValue({
        session_id: 'sid',
        pdf_id: 'pid',
        db_session_id: 'db1',
        filename: 'Already.PDF',
      });
      vi.mocked(api.fetchStoredPdfBlob).mockResolvedValue(
        new Blob(['%PDF'], { type: 'application/pdf' })
      );

      const { result } = renderHook(() => usePdf(), {
        wrapper: AuthTestProviders,
      });

      await act(async () => {
        await result.current.restoreSession('row-pdf-ext');
      });

      expect(result.current.pdfFile?.name).toBe('Already.PDF');
    });
  });

  describe('pdfReducer SAVE_PDF replace', () => {
    it('replaces file with same name in list', async () => {
      const first = createMockPdfFile('dup.pdf');
      const second = createMockPdfFile('dup.pdf');
      const { result } = renderHook(() => usePdf(), {
        wrapper: TestProviders,
      });
      await act(async () => {
        await result.current.savePdf(first);
      });
      await act(async () => {
        await result.current.savePdf(second);
      });
      expect(result.current.pdfList.length).toBe(1);
    });
  });
});
