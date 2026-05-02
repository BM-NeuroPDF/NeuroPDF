import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { sendRequest } from '@/utils/api';
import type { Message } from '@/context/PdfContext';

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
  makeAssistantMessage: (
    key: string,
    params?: Record<string, string>
  ) => Message;
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
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const isProUser =
    userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';

  const activeSessionId = pdfSessionId || generalSessionId;

  const initChatSession = useCallback(async () => {
    if (activeSessionId) return;
    setInitializing(true);
    try {
      const res = await sendRequest('/files/chat/general/start', 'POST', {
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
        let chatRes: { session_id?: string; db_session_id?: string } | null =
          null;
        if (existingDocumentId) {
          chatRes = await sendRequest('/files/chat/start-from-text', 'POST', {
            pdf_text: ' ',
            filename: pdfFile.name,
            pdf_id: existingDocumentId,
            language: language,
          });
        } else {
          const formData = new FormData();
          formData.append('file', pdfFile);
          formData.append('language', language);
          chatRes = await sendRequest(
            '/files/chat/start',
            'POST',
            formData,
            true
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
          setPdfChatMessages([
            makeAssistantMessage('chatWelcomePdf', { name: pdfFile.name }),
          ]);
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
    const fetchUserRole = async () => {
      if (status === 'loading' || status === 'unauthenticated') {
        setIsRoleLoading(status === 'loading');
        setUserRole(null);
        return;
      }
      if (!session) {
        setIsRoleLoading(false);
        setUserRole(null);
        return;
      }

      setIsRoleLoading(true);
      const maxAttempts = 3;
      let attempt = 0;
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          const data = await sendRequest('/files/user/stats', 'GET');
          setUserRole(data?.role ?? null);
          setIsRoleLoading(false);
          return;
        } catch (error: unknown) {
          const msg =
            error && typeof error === 'object' && 'message' in error
              ? String((error as { message?: string }).message)
              : '';
          const isAuthExpired =
            msg.includes('Oturum süreniz dolmuş') ||
            msg.includes('expired') ||
            msg.includes('401');

          if (isAuthExpired) {
            setUserRole(null);
            setIsRoleLoading(false);
            return;
          }

          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }

          console.error('Rol kontrolü hatası (retry bitti):', error);
          setIsRoleLoading(false);
        }
      }
    };
    void fetchUserRole();
  }, [session, status]);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!session?.user || !proChatPanelOpen) return;
    const uid = userId || 'me';
    let cancelled = false;
    (async () => {
      try {
        const blob = (await sendRequest(
          `/api/v1/user/${uid}/avatar`,
          'GET'
        )) as Blob;
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
