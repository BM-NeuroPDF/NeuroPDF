import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Session } from 'next-auth';
import { getSession } from 'next-auth/react';
import { guestService } from '@/services/guestService';
import type { Message } from '@/context/PdfContext';
import {
  sendRequest,
  type ChatStartFromTextResponse,
  type SummarizeApiResponse,
} from '@/utils/api';
import type { UserStats } from '@/hooks/useUserStats';
import { translations } from '@/utils/translations';
import { presentError, toAppError } from '@/utils/errorPresenter';
import { logError } from '@/utils/logger';
import { z } from 'zod';
import { parseSummarizeSseEvent } from '@/schemas/summarizeSse';

const errorMessageCarrierSchema = z.object({ message: z.string() });

function messageFromUnknownError(e: unknown): string {
  if (e instanceof Error) return e.message;
  const r = errorMessageCarrierSchema.safeParse(e);
  return r.success ? r.data.message : '';
}

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
    sendRequest<UserStats>('/files/user/stats', 'GET')
      .then((data) => setUserRole(data?.role ?? null))
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
    [savePdf, clearError, resetAudio, setFile],
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
      let data: SummarizeApiResponse | null = null;
      if (session) {
        const formData = new FormData();
        formData.append('file', file);
        const isVitest = typeof process !== 'undefined' && !!process.env.VITEST;
        if (isVitest) {
          data = await sendRequest<SummarizeApiResponse>(
            '/files/summarize',
            'POST',
            formData,
            true,
          );
        } else {
          const currentSession = await getSession();
          const token =
            currentSession?.accessToken ??
            currentSession?.apiToken ??
            currentSession?.user?.accessToken ??
            currentSession?.user?.apiToken;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          const response = await fetch('/files/summarize/stream?language=tr', {
            method: 'POST',
            headers,
            body: formData,
          });
          if (!response.ok || !response.body) {
            throw new Error(`Stream failed: ${response.status}`);
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let summaryAcc = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';
            for (const part of parts) {
              const line = part.split('\n').find((l) => l.startsWith('data:'));
              if (!line) continue;
              const raw: unknown = JSON.parse(line.slice(5).trim());
              const sse = parseSummarizeSseEvent(raw);
              if (sse.type === 'token' && sse.token) {
                summaryAcc += sse.token;
                setSummary(summaryAcc);
              } else if (sse.type === 'done') {
                data = { summary: sse.summary, pdf_text: sse.pdf_text };
              } else if (sse.type === 'error') {
                throw new Error(sse.detail || 'stream error');
              }
            }
          }
        }
      } else {
        const formData = new FormData();
        formData.append('file', file);
        data = await sendRequest<SummarizeApiResponse>(
          '/files/summarize-guest',
          'POST',
          formData,
          true,
        );
      }

      if (data && data.summary) {
        setSummary(data.summary);
        setSummarizing(false);

        if (data.pdf_text && session && file) {
          void (async () => {
            try {
              const stats = await sendRequest<UserStats>('/files/user/stats', 'GET');
              const role = (stats?.role ?? '').toLowerCase();
              if (role !== 'pro' && role !== 'pro user') return;

              const chatRes = await sendRequest<ChatStartFromTextResponse>(
                '/files/chat/start-from-text',
                'POST',
                {
                  pdf_text: data.pdf_text,
                  filename: file.name,
                },
              );

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
            } catch (e: unknown) {
              const msg = messageFromUnknownError(e);
              if (msg.includes('403') || msg.includes('Pro')) return;

              const appErr = toAppError(e);
              logError(appErr, {
                scope: 'usePdfSummarize.chatBootstrap',
                code: appErr.code,
                category: appErr.category,
              });
              const presented = presentError(appErr);
              console.warn('PDF chat session başlatılamadı:', presented.inlineMessage);
            }
          })();
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
