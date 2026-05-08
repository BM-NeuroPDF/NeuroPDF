import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { PdfActionsContext, usePdfActions } from '@/context/pdf/PdfActionsContext';
import { PdfDataContext, usePdfData } from '@/context/pdf/PdfDataContext';
import type { PdfActionsContextValue, PdfDataContextValue } from '@/context/pdf/pdfContextTypes';

describe('pdf context hooks', () => {
  it('throws when usePdfActions is outside provider', () => {
    expect(() => renderHook(() => usePdfActions())).toThrow(
      'usePdfActions must be used within a PdfProvider',
    );
  });

  it('returns PdfActionsContext value from provider', () => {
    const actionsValue: PdfActionsContextValue = {
      savePdf: async () => {},
      saveExistingPdf: async () => {},
      addPdfs: () => {},
      removePdf: () => {},
      setActivePdf: () => {},
      clearPdf: () => {},
      triggerRefresh: () => {},
      loadChatSessions: async () => {},
      restoreSession: async () => {},
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <PdfActionsContext.Provider value={actionsValue}>{children}</PdfActionsContext.Provider>
    );
    const { result } = renderHook(() => usePdfActions(), { wrapper });
    expect(typeof result.current.savePdf).toBe('function');
    expect(typeof result.current.clearPdf).toBe('function');
  });

  it('throws when usePdfData is outside provider', () => {
    expect(() => renderHook(() => usePdfData())).toThrow(
      'usePdfData must be used within a PdfProvider',
    );
  });

  it('returns PdfDataContext value from provider', () => {
    const dataValue: PdfDataContextValue = {
      pdfFile: null,
      pdfList: [],
      refreshKey: 0,
      chatMessages: [],
      setChatMessages: () => {},
      isChatActive: false,
      setIsChatActive: () => {},
      sessionId: null,
      setSessionId: () => {},
      generalChatMessages: [],
      setGeneralChatMessages: () => {},
      generalSessionId: null,
      setGeneralSessionId: () => {},
      chatSessions: [],
      chatSessionsLoading: false,
      activeSessionDbId: null,
      setActiveSessionDbId: () => {},
      existingDocumentId: null,
      setExistingDocumentId: () => {},
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <PdfDataContext.Provider value={dataValue}>{children}</PdfDataContext.Provider>
    );
    const { result } = renderHook(() => usePdfData(), { wrapper });
    expect(result.current.pdfFile).toBeNull();
    expect(result.current.pdfList).toEqual([]);
  });
});
