import type React from 'react';
import type { ChatSessionListItem } from '@/utils/api';
import type { Message } from './pdfModel';

/** Client-side PDF + chat payload (mirrors server; no SWR cache layer here). */
export type PdfDataContextValue = {
  pdfFile: File | null;
  pdfList: File[];
  refreshKey: number;
  chatMessages: Message[];
  setChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isChatActive: boolean;
  setIsChatActive: (val: boolean) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
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
};

export type PdfUiContextValue = {
  proChatOpen: boolean;
  setProChatOpen: (v: boolean) => void;
  proChatPanelOpen: boolean;
  setProChatPanelOpen: (v: boolean) => void;
};

export type PdfActionsContextValue = {
  savePdf: (file: File | null) => Promise<void>;
  saveExistingPdf: (file: File, documentId: string) => Promise<void>;
  addPdfs: (files: File[]) => void;
  removePdf: (fileName: string) => void;
  setActivePdf: (fileName: string) => void;
  clearPdf: () => void;
  triggerRefresh: () => void;
  loadChatSessions: () => Promise<void>;
  restoreSession: (sessionDbId: string) => Promise<void>;
};

/** @deprecated Prefer usePdfData, usePdfUi, usePdfActions for finer subscriptions. */
export type PdfContextMerged = PdfDataContextValue & PdfUiContextValue & PdfActionsContextValue;
