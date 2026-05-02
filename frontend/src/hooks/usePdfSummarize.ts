import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Session } from 'next-auth';
import { guestService } from '@/services/guestService';
import type { Message } from '@/context/PdfContext';
import { sendRequest } from '@/utils/api';
import { translations } from '@/utils/translations';

export type SummarizePdfErrorType =
  | 'NONE'
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'CUSTOM'
  | 'UPLOAD_FIRST'
  | 'PANEL_ERROR'
  | 'SUMMARY_ERROR'
  | 'AUDIO_ERROR'
  | 'PDF_GEN_ERROR';

export interface UsePdfSummarizeParams {
  session: Session | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  file: File | null;
  setFile: Dispatch<SetStateAction<File | null>>;
  savePdf: (file: File | null) => void;
  checkLimit: () => Promise<boolean>;
  showError: (message: string) => void;
  t: (key: keyof (typeof translations)['tr']) => string;
  maxBytes: number;
  resetAudio: () => void;
  setSessionId: (id: string) => void;
  setIsChatActive: (active: boolean) => void;
  setChatMessages: Dispatch<SetStateAction<Message[]>>;
  setActiveSessionDbId: (id: string | null) => void;
  loadChatSessions: () => void | Promise<void>;
}

export interface UsePdfSummarizeReturn {
  userRole: string | null;
  summary: string;
  summarizing: boolean;
  errorType: SummarizePdfErrorType;
  customErrorMsg: string | null;
  clearError: () => void;
  resetState: (f: File) => void;
  summarize: () => Promise<void>;
  /** Dropzone / dosya seçimi hataları için (sayfa kullanır). */
  setErrorType: Dispatch<SetStateAction<SummarizePdfErrorType>>;
  setCustomErrorMsg: Dispatch<SetStateAction<string | null>>;
  /** Yeni işlem / dış sıfırlama için (sayfa kullanır). */
  setSummary: Dispatch<SetStateAction<string>>;
}

export function usePdfSummarize({
  session,
  status,
  file,
  setFile,
  savePdf,
  checkLimit,
  showError,
  t,
  maxBytes,
  resetAudio,
  setSessionId,
  setIsChatActive,
  setChatMessages,
  setActiveSessionDbId,
  loadChatSessions,
}: UsePdfSummarizeParams): UsePdfSummarizeReturn {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [errorType, setErrorType] = useState<SummarizePdfErrorType>('NONE');
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !session) return;
    sendRequest('/files/user/stats', 'GET')
      .then((data: { role?: string }) => setUserRole(data?.role ?? null))
      .catch(() => setUserRole(null));
  }, [status, session]);

  const clearError = useCallback(() => {
    setErrorType('NONE');
    setCustomErrorMsg(null);
  }, []);

  const resetState = useCallback(
    (f: File) => {
      setFile(f);
      savePdf(f);
      setSummary('');
      clearError();
      resetAudio();
    },
    [savePdf, clearError, resetAudio, setFile]
  );

  const summarize = useCallback(async () => {
    if (!file) {
      setErrorType('UPLOAD_FIRST');
      return;
    }
    if (!session) {
      const canProceed = await checkLimit();
      if (!canProceed) return;
    }
    clearError();
    setSummarizing(true);
    resetAudio();

    try {
      const formData = new FormData();
      formData.append('file', file);
      const summarizeEndpoint = session
        ? '/files/summarize'
        : '/files/summarize-guest';
      const data = (await sendRequest(
        summarizeEndpoint,
        'POST',
        formData,
        true
      )) as {
        summary?: string;
        pdf_text?: string;
      };

      if (data && data.summary) {
        setSummary(data.summary);
        setSummarizing(false);

        if (data.pdf_text && session && file) {
          sendRequest('/files/user/stats', 'GET')
            .then((stats: { role?: string }) => {
              const role = (stats?.role ?? '').toLowerCase();
              if (role !== 'pro' && role !== 'pro user') return;
              return sendRequest('/files/chat/start-from-text', 'POST', {
                pdf_text: data.pdf_text,
                filename: file.name,
              });
            })
            .then(
              (
                chatRes: {
                  session_id?: string;
                  db_session_id?: string | null;
                } | void
              ) => {
                if (chatRes?.session_id) {
                  setSessionId(chatRes.session_id);
                  setIsChatActive(true);
                  if (chatRes?.db_session_id) {
                    setActiveSessionDbId(chatRes.db_session_id);
                  }
                  void loadChatSessions();
                  setChatMessages([
                    {
                      role: 'assistant',
                      content: `👋 Merhaba! **"${file.name}"** dosyasını analiz ettim. Bana bu belgeyle ilgili her şeyi sorabilirsin.`,
                    },
                  ]);
                }
              }
            )
            .catch((e: { message?: string }) => {
              if (e?.message?.includes('403') || e?.message?.includes('Pro'))
                return;
              console.warn('PDF chat session başlatılamadı:', e);
            });
        }

        if (!session) {
          try {
            await guestService.incrementUsage();
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        throw new Error('Özet alınamadı.');
      }
    } catch (e: unknown) {
      console.error('PDF Özetleme Hatası:', e);
      setErrorType('SUMMARY_ERROR');
      setSummarizing(false);
    }
  }, [
    file,
    session,
    checkLimit,
    clearError,
    resetAudio,
    setSessionId,
    setIsChatActive,
    setActiveSessionDbId,
    loadChatSessions,
    setChatMessages,
  ]);

  const currentError = useMemo(() => {
    if (customErrorMsg) return customErrorMsg;

    switch (errorType) {
      case 'INVALID_TYPE':
        return t('invalidFileType');
      case 'SIZE_EXCEEDED':
        return `${t('fileSizeExceeded')} (Max: ${(maxBytes / (1024 * 1024)).toFixed(0)} MB)`;
      case 'PANEL_ERROR':
        return t('panelPdfError');
      case 'UPLOAD_FIRST':
        return t('uploadFirst');
      case 'SUMMARY_ERROR':
        return t('summarizeFailed');
      case 'AUDIO_ERROR':
        return 'Seslendirme servisine ulaşılamadı.';
      case 'PDF_GEN_ERROR':
        return 'PDF oluşturulurken hata meydana geldi.';
      default:
        return null;
    }
  }, [customErrorMsg, errorType, t, maxBytes]);

  useEffect(() => {
    if (currentError) {
      showError(currentError);
    }
  }, [currentError, showError]);

  return {
    userRole,
    summary,
    summarizing,
    errorType,
    customErrorMsg,
    clearError,
    resetState,
    summarize,
    setErrorType,
    setCustomErrorMsg,
    setSummary,
  };
}
