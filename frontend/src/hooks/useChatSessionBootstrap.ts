import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Session } from 'next-auth';
import {
  sendRequest,
  type ChatGeneralStartResponse,
  type ChatStartFromTextResponse,
} from '@/utils/api';
import type { Message } from '@/context/PdfContext';
import { useUserStats, type UserStats } from '@/hooks/useUserStats';

type UseChatSessionBootstrapParams<K extends string> = {
  session: {
    user?: {
      id?: string;
      image?: string | null;
      name?: string | null;
    } | null;
  } | null;
  status: 'authenticated' | 'unauthenticated' | 'loading';
  language: string;
  t: (key: K) => string;
  pdfFile: File | null;
  existingDocumentId: string | null;
  pdfSessionId: string | null;
  generalSessionId: string | null;
  proChatOpen: boolean;
  proChatPanelOpen: boolean;
  setProChatOpen: (value: boolean) => void;
  setProChatPanelOpen: (value: boolean) => void;
  setPdfSessionId: (id: string | null) => void;
  setGeneralSessionId: (id: string | null) => void;
  setIsChatActive: (value: boolean) => void;
  setActiveSessionDbId: (id: string | null) => void;
  setPdfChatMessages: Dispatch<SetStateAction<Message[]>>;
  setGeneralChatMessages: Dispatch<SetStateAction<Message[]>>;
  makeAssistantMessage: (key: string, params?: Record<string, string>) => Message;
  loadChatSessions: () => Promise<void>;
  setInitializing: Dispatch<SetStateAction<boolean>>;
};

export function useChatSessionBootstrap<K extends string>({
  session,
  status,
  language,
  t,
  pdfFile,
  existingDocumentId,
  pdfSessionId,
  generalSessionId,
  proChatOpen,
  proChatPanelOpen,
  setProChatOpen,
  setProChatPanelOpen,
  setPdfSessionId,
  setGeneralSessionId,
  setIsChatActive,
  setActiveSessionDbId,
  setPdfChatMessages,
  setGeneralChatMessages,
  makeAssistantMessage,
  loadChatSessions,
  setInitializing,
}: UseChatSessionBootstrapParams<K>) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(status === 'loading');
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const { data: statsData, isLoading: statsLoading } = useUserStats(
    session as Session | null,
    status,
  );
  const isProUser = userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';

  const activeSessionId = pdfSessionId || generalSessionId;

  const initChatSession = useCallback(async () => {
    if (activeSessionId) return;
    setInitializing(true);
    try {
      const res = await sendRequest<ChatGeneralStartResponse>('/files/chat/general/start', 'POST', {
        llm_provider: 'cloud',
        mode: 'flash',
        language: language,
      });
      if (!res.session_id) throw new Error(t('chatInitError' as K));
      setGeneralSessionId(res.session_id);
      setGeneralChatMessages([makeAssistantMessage('chatWelcomeGeneral')]);
    } catch (e) {
      console.error('Chat başlatma hatası:', e);
      setGeneralChatMessages([makeAssistantMessage('chatInitError')]);
    } finally {
      setInitializing(false);
    }
  }, [
    activeSessionId,
    language,
    makeAssistantMessage,
    setGeneralChatMessages,
    setGeneralSessionId,
    setInitializing,
    t,
  ]);

  useEffect(() => {
    if (proChatOpen) {
      setProChatPanelOpen(true);
      setProChatOpen(false);
    }
  }, [proChatOpen, setProChatOpen, setProChatPanelOpen]);

  useEffect(() => {
    if (!pdfFile || !isProUser || pdfSessionId) return;
    let cancelled = false;
    (async () => {
      setInitializing(true);
      try {
        let chatRes: ChatStartFromTextResponse | null = null;
        if (existingDocumentId) {
          chatRes = await sendRequest<ChatStartFromTextResponse>(
            '/files/chat/start-from-text',
            'POST',
            {
              pdf_text: ' ',
              filename: pdfFile.name,
              pdf_id: existingDocumentId,
              language: language,
            },
          );
        } else {
          const formData = new FormData();
          formData.append('file', pdfFile);
          formData.append('language', language);
          chatRes = await sendRequest<ChatStartFromTextResponse>(
            '/files/chat/start',
            'POST',
            formData,
            true,
          );
        }
        if (cancelled) return;
        if (chatRes?.session_id) {
          setPdfSessionId(chatRes.session_id);
          setIsChatActive(true);
          if (chatRes?.db_session_id) {
            setActiveSessionDbId(chatRes.db_session_id);
          }
          void loadChatSessions();
          setPdfChatMessages([makeAssistantMessage('chatWelcomePdf', { name: pdfFile.name })]);
        }
      } catch (e) {
        if (!cancelled) console.error('PDF chat otomatik başlatma hatası:', e);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    existingDocumentId,
    isProUser,
    language,
    loadChatSessions,
    makeAssistantMessage,
    pdfFile,
    pdfSessionId,
    setActiveSessionDbId,
    setInitializing,
    setIsChatActive,
    setPdfChatMessages,
    setPdfSessionId,
  ]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      setUserRole(null);
      setIsRoleLoading(false);
      return;
    }
    setUserRole(statsData?.role ?? null);
    setIsRoleLoading(status === 'loading' || statsLoading);
  }, [statsData?.role, statsLoading, status]);

  useEffect(() => {
    if (status !== 'authenticated' || statsData?.role) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await sendRequest<UserStats>('/files/user/stats', 'GET');
        if (!cancelled) setUserRole(data?.role ?? null);
      } catch {
        if (!cancelled) setUserRole(null);
      } finally {
        if (!cancelled) setIsRoleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, statsData?.role]);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!session?.user || !proChatPanelOpen) return;
    const uid = userId || 'me';
    let cancelled = false;
    (async () => {
      try {
        const blob = await sendRequest<Blob>(`/api/v1/user/${uid}/avatar`, 'GET');
        if (cancelled) return;
        if (blob && blob.size > 0) {
          setAvatarSrc((prev) => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          return;
        }
      } catch {
        // fallback to session image
      }
      if (session?.user?.image) setAvatarSrc(session.user.image);
    })();
    return () => {
      cancelled = true;
    };
  }, [proChatPanelOpen, session?.user, userId]);

  return {
    userRole,
    isRoleLoading,
    avatarSrc,
    initChatSession,
  };
}
