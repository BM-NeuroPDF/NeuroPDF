'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useReducer,
  useRef,
  ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  fetchChatSessions,
  fetchSessionMessages,
  resumeChatSession,
  fetchStoredPdfBlob,
  type ChatSessionListItem,
} from '@/utils/api';

const STORAGE_KEY = 'activePdfBase64';

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type PdfCoreState = {
  list: File[];
  active: File | null;
};

type PdfAction =
  | { type: 'ADD_PDFS'; files: File[] }
  | { type: 'REMOVE'; fileName: string }
  | { type: 'SET_ACTIVE'; fileName: string }
  | { type: 'SAVE_PDF'; file: File | null }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; file: File };

function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

export function pdfReducer(
  state: PdfCoreState,
  action: PdfAction
): PdfCoreState {
  switch (action.type) {
    case 'ADD_PDFS': {
      const candidates = action.files.filter(isPdfFile);
      const names = new Set(state.list.map((f) => f.name));
      const toAdd: File[] = [];
      for (const f of candidates) {
        if (!names.has(f.name)) {
          toAdd.push(f);
          names.add(f.name);
        }
      }
      const list = [...state.list, ...toAdd];
      const active = state.active ?? list[0] ?? null;
      return { list, active };
    }
    case 'REMOVE': {
      const list = state.list.filter((f) => f.name !== action.fileName);
      const active =
        state.active?.name === action.fileName
          ? (list[0] ?? null)
          : state.active;
      return { list, active };
    }
    case 'SET_ACTIVE': {
      const f = state.list.find((x) => x.name === action.fileName);
      if (!f) return state;
      return { ...state, active: f };
    }
    case 'SAVE_PDF': {
      if (!action.file) {
        return { list: [], active: null };
      }
      if (typeof action.file.slice !== 'function') {
        return state;
      }
      const file = action.file;
      const idx = state.list.findIndex((f) => f.name === file.name);
      const list =
        idx >= 0
          ? state.list.map((f, i) => (i === idx ? file : f))
          : [...state.list, file];
      return { list, active: file };
    }
    case 'CLEAR':
      return { list: [], active: null };
    case 'HYDRATE':
      return { list: [action.file], active: action.file };
    default:
      return state;
  }
}

interface PdfContextType {
  pdfFile: File | null;
  pdfList: File[];
  savePdf: (file: File | null) => Promise<void>;
  saveExistingPdf: (file: File, documentId: string) => Promise<void>;
  addPdfs: (files: File[]) => void;
  removePdf: (fileName: string) => void;
  setActivePdf: (fileName: string) => void;
  clearPdf: () => void;
  refreshKey: number;
  triggerRefresh: () => void;
  chatMessages: Message[];
  setChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isChatActive: boolean;
  setIsChatActive: (val: boolean) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  proChatOpen: boolean;
  setProChatOpen: (v: boolean) => void;
  proChatPanelOpen: boolean;
  setProChatPanelOpen: (v: boolean) => void;
  generalChatMessages: Message[];
  setGeneralChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  generalSessionId: string | null;
  setGeneralSessionId: (id: string | null) => void;
  chatSessions: ChatSessionListItem[];
  chatSessionsLoading: boolean;
  activeSessionDbId: string | null;
  setActiveSessionDbId: (id: string | null) => void;
  existingDocumentId: string | null;
  setExistingDocumentId: (id: string | null) => void;
  loadChatSessions: () => Promise<void>;
  restoreSession: (sessionDbId: string) => Promise<void>;
}

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useSession();
  const [pdfState, dispatch] = useReducer(pdfReducer, {
    list: [],
    active: null,
  });
  const pdfFile = pdfState.active;
  const pdfList = pdfState.list;

  const [refreshKey, setRefreshKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const persistEpochRef = useRef(0);

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isChatActive, setIsChatActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [proChatOpen, setProChatOpen] = useState(false);
  const [proChatPanelOpen, setProChatPanelOpen] = useState(false);
  const [generalChatMessages, setGeneralChatMessages] = useState<Message[]>([]);
  const [generalSessionId, setGeneralSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [chatSessionsLoading, setChatSessionsLoading] = useState(false);
  const [activeSessionDbId, setActiveSessionDbId] = useState<string | null>(
    null
  );
  const [existingDocumentId, setExistingDocumentId] = useState<string | null>(
    null
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const byteString = atob(stored.split(',')[1]);
        const array = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++)
          array[i] = byteString.charCodeAt(i);
        const blob = new Blob([array], { type: 'application/pdf' });
        const file = new File([blob], 'restored_document.pdf', {
          type: 'application/pdf',
        });
        dispatch({ type: 'HYDRATE', file });
      }
    } catch (e) {
      console.error('PDF kurtarma hatası:', e);
      sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const myEpoch = ++persistEpochRef.current;
    if (!pdfState.active) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const file = pdfState.active;
    const reader = new FileReader();
    reader.onload = () => {
      if (myEpoch !== persistEpochRef.current) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, reader.result as string);
      } catch {
        console.warn("⚠️ PDF çok büyük, sessionStorage'a kaydedilemedi.");
      }
      setRefreshKey((k) => k + 1);
    };
    reader.readAsDataURL(file);
  }, [pdfState.active, hydrated]);

  const loadChatSessions = useCallback(async () => {
    if (authStatus !== 'authenticated') {
      setChatSessions([]);
      return;
    }
    setChatSessionsLoading(true);
    try {
      const data = await fetchChatSessions();
      setChatSessions(data.sessions ?? []);
    } catch {
      setChatSessions([]);
    } finally {
      setChatSessionsLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void loadChatSessions();
    } else {
      setChatSessions([]);
      setActiveSessionDbId(null);
      setExistingDocumentId(null);
    }
  }, [authStatus, loadChatSessions]);

  const restoreSession = useCallback(
    async (sessionDbId: string) => {
      try {
        const { messages } = await fetchSessionMessages(sessionDbId);
        const ui: Message[] = (messages ?? [])
          .filter(
            (m) =>
              (m.role === 'user' || m.role === 'assistant') && m.content != null
          )
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: String(m.content),
          }));

        const resume = await resumeChatSession(sessionDbId);

        let chatUi = ui;
        if (chatUi.length === 0) {
          const fn = resume.filename?.trim() || 'document.pdf';
          chatUi = [
            {
              role: 'assistant',
              content: `👋 Merhaba! **"${fn}"** dosyasını analiz ettim. Bana bu belgeyle ilgili her şeyi sorabilirsin.`,
            },
          ];
        }
        setChatMessages(chatUi);
        setSessionId(resume.session_id);
        setActiveSessionDbId(sessionDbId);
        setExistingDocumentId(resume.pdf_id ?? null);
        setIsChatActive(true);
        setProChatOpen(false);
        setProChatPanelOpen(true);
        setRefreshKey((k) => k + 1);

        if (resume.pdf_id) {
          try {
            const blob = await fetchStoredPdfBlob(resume.pdf_id);
            let fname = resume.filename?.trim() || 'document.pdf';
            if (!fname.toLowerCase().endsWith('.pdf')) {
              fname = `${fname}.pdf`;
            }
            const file = new File([blob], fname, { type: 'application/pdf' });
            dispatch({ type: 'SAVE_PDF', file });
          } catch (pdfErr) {
            console.warn('Kayıtlı PDF yüklenemedi:', pdfErr);
            toast.message(
              'Sohbet yüklendi; PDF önizlemesi sunucudan alınamadı.'
            );
          }
        }

        void loadChatSessions();
        toast.success('Sohbet oturumu geri yüklendi.');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Oturum yüklenemedi.';
        toast.error(msg);
      }
    },
    [loadChatSessions]
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

  return (
    <PdfContext.Provider
      value={{
        pdfFile,
        pdfList,
        savePdf,
        saveExistingPdf,
        addPdfs,
        removePdf,
        setActivePdf,
        clearPdf,
        refreshKey,
        triggerRefresh: () => setRefreshKey((k) => k + 1),
        chatMessages,
        setChatMessages,
        isChatActive,
        setIsChatActive,
        sessionId,
        setSessionId,
        proChatOpen,
        setProChatOpen,
        proChatPanelOpen,
        setProChatPanelOpen,
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
        loadChatSessions,
        restoreSession,
      }}
    >
      {children}
    </PdfContext.Provider>
  );
}

export function usePdf() {
  const context = useContext(PdfContext);
  if (!context) throw new Error('usePdf must be used within a PdfProvider');
  return context;
}
