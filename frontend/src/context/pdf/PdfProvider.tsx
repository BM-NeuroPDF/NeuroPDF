'use client';

import { useCallback, useMemo, useReducer, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { pdfReducer, STORAGE_KEY } from './pdfModel';
import { createRestoreChatSession } from './createRestoreChatSession';
import { usePdfSessionStorageEffects } from './usePdfSessionStorageEffects';
import { useAuthenticatedChatSessions } from './useAuthenticatedChatSessions';
import { useChatSessionsState } from './useChatSessionsState';
import type { PdfDataContextValue } from './pdfContextTypes';
import type { PdfUiContextValue } from './pdfContextTypes';
import type { PdfActionsContextValue } from './pdfContextTypes';
import { PdfDataContext } from './PdfDataContext';
import { PdfUiContext } from './PdfUiContext';
import { PdfActionsContext } from './PdfActionsContext';

export function PdfProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useSession();
  const [pdfState, dispatch] = useReducer(pdfReducer, {
    list: [],
    active: null,
  });
  const pdfFile = pdfState.active;
  const pdfList = pdfState.list;

  const [refreshKey, setRefreshKey] = useState(0);
  const onPersistWritten = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  usePdfSessionStorageEffects(dispatch, pdfState.active, onPersistWritten);

  const [chatMessages, setChatMessages] = useState<PdfDataContextValue['chatMessages']>([]);
  const [isChatActive, setIsChatActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [proChatOpen, setProChatOpen] = useState(false);
  const [proChatPanelOpen, setProChatPanelOpen] = useState(false);
  const [generalChatMessages, setGeneralChatMessages] = useState<
    PdfDataContextValue['generalChatMessages']
  >([]);
  const [generalSessionId, setGeneralSessionId] = useState<string | null>(null);
  const { chatSessions, setChatSessions, chatSessionsLoading, loadChatSessions } =
    useChatSessionsState(authStatus);
  const [activeSessionDbId, setActiveSessionDbId] = useState<string | null>(null);
  const [existingDocumentId, setExistingDocumentId] = useState<string | null>(null);

  const onChatAuthLoggedOut = useCallback(() => {
    setChatSessions([]);
    setActiveSessionDbId(null);
    setExistingDocumentId(null);
  }, [setChatSessions]);

  useAuthenticatedChatSessions(authStatus, loadChatSessions, onChatAuthLoggedOut);

  const bumpRefreshKey = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const restoreSession = useMemo(
    () =>
      createRestoreChatSession({
        dispatch,
        setChatMessages,
        setSessionId,
        setActiveSessionDbId,
        setExistingDocumentId,
        setIsChatActive,
        setProChatOpen,
        setProChatPanelOpen,
        bumpRefreshKey,
        loadChatSessions,
      }),
    [dispatch, loadChatSessions, setProChatOpen, setProChatPanelOpen, bumpRefreshKey],
  );

  const savePdf = useCallback((file: File | null) => {
    return new Promise<void>((resolve) => {
      if (!file) {
        dispatch({ type: 'CLEAR' });
        sessionStorage.removeItem(STORAGE_KEY);
        setIsChatActive(false);
        setChatMessages([]);
        setSessionId(null);
        setActiveSessionDbId(null);
        setExistingDocumentId(null);
        setRefreshKey((k) => k + 1);
        resolve();
        return;
      }
      if (typeof file.slice !== 'function') {
        resolve();
        return;
      }
      dispatch({ type: 'SAVE_PDF', file });
      setExistingDocumentId(null);
      resolve();
    });
  }, []);

  const saveExistingPdf = useCallback((file: File, documentId: string) => {
    return new Promise<void>((resolve) => {
      if (typeof file.slice !== 'function') {
        resolve();
        return;
      }
      dispatch({ type: 'SAVE_PDF', file });
      setExistingDocumentId(documentId);
      resolve();
    });
  }, []);

  const addPdfs = useCallback((files: File[]) => {
    if (!files.length) return;
    dispatch({ type: 'ADD_PDFS', files });
  }, []);

  const removePdf = useCallback((fileName: string) => {
    dispatch({ type: 'REMOVE', fileName });
  }, []);

  const setActivePdf = useCallback((fileName: string) => {
    dispatch({ type: 'SET_ACTIVE', fileName });
  }, []);

  const clearPdf = useCallback(() => {
    dispatch({ type: 'CLEAR' });
    setIsChatActive(false);
    setChatMessages([]);
    setSessionId(null);
    setActiveSessionDbId(null);
    setExistingDocumentId(null);
    sessionStorage.removeItem(STORAGE_KEY);
    setRefreshKey((k) => k + 1);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const dataValue = useMemo<PdfDataContextValue>(
    () => ({
      pdfFile,
      pdfList,
      refreshKey,
      chatMessages,
      setChatMessages,
      isChatActive,
      setIsChatActive,
      sessionId,
      setSessionId,
      generalChatMessages,
      setGeneralChatMessages,
      generalSessionId,
      setGeneralSessionId,
      chatSessions,
      chatSessionsLoading,
      activeSessionDbId,
      setActiveSessionDbId,
      existingDocumentId,
      setExistingDocumentId,
    }),
    [
      pdfFile,
      pdfList,
      refreshKey,
      chatMessages,
      isChatActive,
      sessionId,
      generalChatMessages,
      generalSessionId,
      chatSessions,
      chatSessionsLoading,
      activeSessionDbId,
      existingDocumentId,
    ],
  );

  const uiValue = useMemo<PdfUiContextValue>(
    () => ({
      proChatOpen,
      setProChatOpen,
      proChatPanelOpen,
      setProChatPanelOpen,
    }),
    [proChatOpen, proChatPanelOpen],
  );

  const actionsValue = useMemo<PdfActionsContextValue>(
    () => ({
      savePdf,
      saveExistingPdf,
      addPdfs,
      removePdf,
      setActivePdf,
      clearPdf,
      triggerRefresh,
      loadChatSessions,
      restoreSession,
    }),
    [
      savePdf,
      saveExistingPdf,
      addPdfs,
      removePdf,
      setActivePdf,
      clearPdf,
      triggerRefresh,
      loadChatSessions,
      restoreSession,
    ],
  );

  return (
    <PdfActionsContext.Provider value={actionsValue}>
      <PdfUiContext.Provider value={uiValue}>
        <PdfDataContext.Provider value={dataValue}>{children}</PdfDataContext.Provider>
      </PdfUiContext.Provider>
    </PdfActionsContext.Provider>
  );
}
