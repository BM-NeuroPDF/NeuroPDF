import { toast } from 'sonner';
import type { Language } from '@/utils/translations';
import { fetchSessionMessages, resumeChatSession, fetchStoredPdfBlob } from '@/utils/api';
import type { Dispatch } from 'react';
import type { Message, PdfAction } from './pdfModel';

type Incoming = Array<{
  role: string;
  content: string;
  id?: string | null;
  sourceLanguage?: 'tr' | 'en' | null;
  translations?: Record<string, string> | null;
}>;

function mapIncomingMessages(sourceMessages: Incoming | undefined | null): Message[] {
  return (sourceMessages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content != null)
    .map((m) => ({
      id: m.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: m.role as 'user' | 'assistant',
      content: String(m.content),
      sourceLanguage:
        m.sourceLanguage === 'en' || m.sourceLanguage === 'tr' ? m.sourceLanguage : undefined,
      translations:
        m.translations && typeof m.translations === 'object'
          ? (m.translations as Partial<Record<Language, string>>)
          : undefined,
    }));
}

type RestoreChatSessionDeps = {
  dispatch: Dispatch<PdfAction>;
  setChatMessages: (m: Message[]) => void;
  setSessionId: (id: string | null) => void;
  setActiveSessionDbId: (id: string | null) => void;
  setExistingDocumentId: (id: string | null) => void;
  setIsChatActive: (v: boolean) => void;
  setProChatOpen: (v: boolean) => void;
  setProChatPanelOpen: (v: boolean) => void;
  bumpRefreshKey: () => void;
  loadChatSessions: () => Promise<void>;
};

export function createRestoreChatSession(deps: RestoreChatSessionDeps) {
  return async (sessionDbId: string) => {
    try {
      const { messages } = await fetchSessionMessages(sessionDbId);
      const resume = await resumeChatSession(sessionDbId);
      const ui = mapIncomingMessages(messages as Incoming);
      const resumeUi = mapIncomingMessages(resume.messages as Incoming);

      let chatUi = ui.length > 0 ? ui : resumeUi;
      if (chatUi.length === 0) {
        const fn = resume.filename?.trim() || 'document.pdf';
        chatUi = [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'assistant',
            content: `WELCOME_PDF:${fn}`,
            sourceLanguage: 'tr',
            translations: { tr: `WELCOME_PDF:${fn}` },
          },
        ];
      }
      deps.setChatMessages(chatUi);
      deps.setSessionId(resume.session_id);
      deps.setActiveSessionDbId(sessionDbId);
      deps.setExistingDocumentId(resume.pdf_id ?? null);
      deps.setIsChatActive(true);
      deps.setProChatOpen(false);
      deps.setProChatPanelOpen(true);
      deps.bumpRefreshKey();

      if (resume.pdf_id) {
        try {
          const blob = await fetchStoredPdfBlob(resume.pdf_id);
          let fname = resume.filename?.trim() || 'document.pdf';
          if (!fname.toLowerCase().endsWith('.pdf')) {
            fname = `${fname}.pdf`;
          }
          const file = new File([blob], fname, { type: 'application/pdf' });
          deps.dispatch({ type: 'SAVE_PDF', file });
        } catch (pdfErr) {
          console.warn('Kayıtlı PDF yüklenemedi:', pdfErr);
          toast.message('Sohbet yüklendi; PDF önizlemesi sunucudan alınamadı.');
        }
      }

      void deps.loadChatSessions();
      toast.success('Sohbet oturumu geri yüklendi.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Oturum yüklenemedi.';
      toast.error(msg);
    }
  };
}
