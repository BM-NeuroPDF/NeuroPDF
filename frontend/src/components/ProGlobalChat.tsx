'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { sendRequest } from '@/utils/api';
import { useLanguage } from '@/context/LanguageContext';
import { usePdf } from '@/context/PdfContext';
import Image from 'next/image';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';
import ProChatPanel from './ProChatPanel';
import type { Language } from '@/utils/translations';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { usePdfClientActions } from '@/hooks/usePdfClientActions';
import { useChatLocalization } from '@/hooks/useChatLocalization';
import { useMessageTranslationQueue } from '@/hooks/useMessageTranslationQueue';
import { useChatSessionBootstrap } from '@/hooks/useChatSessionBootstrap';

export default function ProGlobalChat() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();

  const {
    pdfFile,
    pdfList,
    savePdf,
    clearPdf,
    sessionId: pdfSessionId,
    chatMessages: pdfChatMessages,
    setChatMessages: setPdfChatMessages,
    setIsChatActive,
    setSessionId: setPdfSessionId,
    proChatOpen,
    setProChatOpen,
    proChatPanelOpen,
    setProChatPanelOpen,
    generalChatMessages,
    setGeneralChatMessages,
    generalSessionId,
    setGeneralSessionId,
    setActiveSessionDbId,
    existingDocumentId,
    loadChatSessions,
  } = usePdf();
  const { applyClientActions } = usePdfClientActions({
    pdfFile,
    pdfList,
    savePdf,
    clearPdf,
    t,
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [showProRequiredModal, setShowProRequiredModal] = useState(false);
  const [typingAudio, setTypingAudio] = useState<HTMLAudioElement | null>(null);
  const { isRecording, stopRecording, toggleRecording } = useVoiceInput({
    language,
    t,
    setInput,
  });

  // Yazıyor... sesi efekti (Loading sırasında döngüsel)
  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    if (loading) {
      audio = new Audio('/sounds/typing.mp3');
      audio.loop = true;
      audio.volume = 0.3;
      audio.play().catch((e) => console.error('Typing sound error:', e));
      setTypingAudio(audio);
    } else {
      if (typingAudio) {
        typingAudio.pause();
        setTypingAudio(null);
      }
    }
    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeChatMessages = pdfSessionId
    ? pdfChatMessages
    : generalChatMessages;
  const isPdfChat = !!pdfSessionId;
  const activeSessionId = pdfSessionId || generalSessionId;
  const { userRole, isRoleLoading, avatarSrc, initChatSession } =
    useChatSessionBootstrap({
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
      makeAssistantMessage: (key: string, params?: Record<string, string>) =>
        makeAssistantMessage(
          key as
            | 'chatWelcomePdf'
            | 'chatWelcomeGeneral'
            | 'chatInitError'
            | 'chatErrorQuotaExceeded'
            | 'chatErrorSessionExpired'
            | 'chatErrorSessionRefresh'
            | 'chatErrorConnection',
          params
        ),
      loadChatSessions,
      setInitializing,
    });
  const isProUser =
    userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';
  const canAccessChat = status === 'authenticated' && isProUser;
  const {
    supportedLanguages,
    makeAssistantMessage,
    makeRuntimeMessage,
    displayChatMessages,
  } = useChatLocalization({
    language,
    t,
    activeChatMessages,
  });
  const { translateAndCacheMessage, enqueueAssistantTranslation } =
    useMessageTranslationQueue({
      language,
      loading,
      supportedLanguages,
      activeChatMessages,
      isPdfChat,
      setPdfChatMessages,
      setGeneralChatMessages,
    });

  const handleFileUpload = async (file: File) => {
    setInitializing(true);
    try {
      // Önceki PDF oturumunu temizle ve yeni dosyayı kaydet
      await savePdf(null);
      await savePdf(file);
      // Bu işlem useEffect'i (satır 59) tetikler ve analizi başlatır.
    } catch (e) {
      console.error('Chat PDF yükleme hatası:', e);
    } finally {
      // setInitializing(false); useEffect içinde yapılacak
    }
  };

  const handleFabClick = () => {
    if (status !== 'authenticated') {
      router.push('/pricing');
      return;
    }
    // Session hydrate/role fetch tamamlanmadan modal açma.
    if (isRoleLoading) return;
    if (!isProUser) {
      setShowProRequiredModal(true);
      return;
    }
    setProChatPanelOpen(true);
    if (!activeSessionId && !isPdfChat) {
      initChatSession();
    }
  };

  const promptSuggestions = useMemo(() => {
    const n = pdfList.length;
    if (n === 0) return [];
    if (n === 1) {
      return [
        { text: t('chatSuggestionSummary'), icon: '📝' },
        { text: t('chatSuggestionTranslate'), icon: '🌐' },
        { text: t('chatSuggestionExtract'), icon: '✂️' },
        { text: t('chatSuggestionClear'), icon: '🧹' },
      ];
    }
    return [
      { text: t('chatSuggestionMerge'), icon: '✨' },
      { text: t('chatSuggestionClear'), icon: '🧹' },
    ];
  }, [pdfList.length, t]);

  const handleSend = async (messageOverride?: string) => {
    const userMsg = (messageOverride ?? input).trim();
    if (!userMsg || !activeSessionId) return;
    if (isRecording) stopRecording();
    setInput('');

    const userMessage = makeRuntimeMessage('user', userMsg);
    if (isPdfChat) {
      setPdfChatMessages((prev) => [...prev, userMessage]);
    } else {
      setGeneralChatMessages((prev) => [...prev, userMessage]);
    }
    void translateAndCacheMessage(userMessage, isPdfChat);
    setLoading(true);

    try {
      const endpoint = isPdfChat
        ? '/api/proxy/chat/message'
        : '/files/chat/general/message';
      const res = await sendRequest(endpoint, 'POST', {
        session_id: activeSessionId,
        message: userMsg,
        message_payload: {
          id: userMessage.id,
          sourceLanguage: userMessage.sourceLanguage,
          translations: userMessage.translations,
        },
        language: language, // Mevcut dili gönder (TR/EN)
      });
      const assistantMessage = makeRuntimeMessage(
        'assistant',
        String(res.answer ?? '')
      );
      if (isPdfChat) {
        setPdfChatMessages((prev) => [...prev, assistantMessage]);
        await applyClientActions(res.client_actions);
        void loadChatSessions();
      } else {
        setGeneralChatMessages((prev) => [...prev, assistantMessage]);
        await applyClientActions(res.client_actions);
      }
      enqueueAssistantTranslation(assistantMessage, isPdfChat);

      // Bildirim sesi çal (Peş peşe 2 defa)
      const playNotify = () => {
        const audio = new Audio('/sounds/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      };
      playNotify();
      setTimeout(playNotify, 600);
    } catch (e: unknown) {
      console.error('Chat mesaj hatası:', e);
      const errorMessage =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : String(e);

      if (
        errorMessage.includes('429') ||
        errorMessage.includes('kotası aşıldı') ||
        errorMessage.includes('quota') ||
        errorMessage.includes('Quota exceeded') ||
        errorMessage.includes('Gemini API')
      ) {
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            makeAssistantMessage('chatErrorQuotaExceeded'),
          ]);
        } else {
          setGeneralChatMessages((prev) => [
            ...prev,
            makeAssistantMessage('chatErrorQuotaExceeded'),
          ]);
        }
        setLoading(false);
        return;
      }

      if (
        errorMessage.includes('Sohbet oturumu bulunamadı') ||
        errorMessage.includes('404') ||
        errorMessage.includes('session')
      ) {
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            makeAssistantMessage('chatErrorSessionExpired'),
          ]);
        } else {
          try {
            const res = await sendRequest('/files/chat/general/start', 'POST', {
              llm_provider: 'cloud',
              mode: 'flash',
              language: language,
            });
            if (res.session_id) {
              setGeneralSessionId(res.session_id);
              const retryRes = await sendRequest(
                '/files/chat/general/message',
                'POST',
                {
                  session_id: res.session_id,
                  message: userMsg,
                  message_payload: {
                    id: userMessage.id,
                    sourceLanguage: userMessage.sourceLanguage,
                    translations: userMessage.translations,
                  },
                  language: language,
                }
              );
              const retryAssistant = makeRuntimeMessage(
                'assistant',
                String(retryRes.answer ?? '')
              );
              setGeneralChatMessages((prev) => [...prev, retryAssistant]);
              await applyClientActions(retryRes.client_actions);
              enqueueAssistantTranslation(retryAssistant, false);

              // Bildirim sesi çal (Retry sonrası da 2 defa)
              const playNotify = () => {
                const audio = new Audio('/sounds/notification.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => {});
              };
              playNotify();
              setTimeout(playNotify, 600);
            } else {
              throw new Error(t('chatInitError'));
            }
          } catch (retryError) {
            console.error('Session yenileme hatası:', retryError);
            setGeneralChatMessages((prev) => [
              ...prev,
              makeAssistantMessage('chatErrorSessionRefresh'),
            ]);
          }
        }
      } else {
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            makeAssistantMessage('chatErrorConnection'),
          ]);
        } else {
          setGeneralChatMessages((prev) => [
            ...prev,
            makeAssistantMessage('chatErrorConnection'),
          ]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FAB: Her zaman görünür; tıklanınca erişim kontrolü */}
      <AnimatePresence>
        {!proChatPanelOpen && (
          <div className="fixed bottom-6 right-6 z-[999] flex flex-col items-end gap-3">
            {/* Konuşma Balonu */}
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.8 }}
              transition={{ delay: 1, duration: 0.4, type: 'spring' }}
              className="bg-[var(--container-bg)] text-[var(--foreground)] px-4 py-2.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-[var(--container-border)] font-bold text-sm relative mb-1 mr-1 pointer-events-none group-hover:scale-105 transition-transform origin-bottom-right max-w-[min(90vw,18rem)] whitespace-normal break-words"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg leading-5">✨</span>
                <span
                  className="leading-5 overflow-hidden"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {t('chatWelcomeGlobal')}
                </span>
              </div>
              {/* Kuyruk (Tail) */}
              <div className="absolute -bottom-[6px] right-7 w-3 h-3 bg-[var(--container-bg)] border-r border-b border-[var(--container-border)] rotate-45" />
            </motion.div>

            {/* FAB */}
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1, rotate: 2 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleFabClick}
              className="p-2 rounded-full group relative flex items-center justify-center bg-transparent hover:bg-[var(--container-bg)]/50 transition-colors border-0 shadow-none"
              aria-label={t('navDocuments')}
              data-testid="global-chat-fab"
            >
              <div className="relative z-10">
                <Image
                  src={NeuroLogoIcon}
                  alt="AI Chat"
                  width={40}
                  height={40}
                  className="drop-shadow-sm brightness-100 dark:brightness-110"
                />
              </div>
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      {/* Pro gerekli bilgilendirme modalı */}
      <AnimatePresence>
        {showProRequiredModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowProRequiredModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl p-6 max-w-sm w-full shadow-xl border"
              style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--container-border)',
              }}
            >
              <h3
                className="font-bold text-lg mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                {t('chatProRequiredTitle')}
              </h3>
              <p className="text-sm opacity-80 mb-6">
                {t('chatProRequiredDesc')}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowProRequiredModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border font-medium transition-colors hover:opacity-90"
                  style={{
                    borderColor: 'var(--container-border)',
                    color: 'var(--foreground)',
                  }}
                >
                  {t('chatClose')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProRequiredModal(false);
                    router.push('/pricing');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  {t('chatGoToPricing')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel: Sadece Pro ve giriş yapmış kullanıcıya açık; state context'te, sayfa geçişinde korunur */}
      {canAccessChat && (
        <ProChatPanel
          isOpen={proChatPanelOpen}
          onClose={() => setProChatPanelOpen(false)}
          messages={displayChatMessages}
          onSend={handleSend}
          onFileUpload={handleFileUpload}
          loading={loading}
          initializing={initializing}
          input={input}
          setInput={setInput}
          promptSuggestions={promptSuggestions}
          promptSuggestionsDisabled={
            !activeSessionId || loading || initializing
          }
          headerTitle="Neuro AI"
          headerSubtitle={
            isPdfChat
              ? pdfFile?.name
                ? t('chatHeaderAnalysis').replace('{name}', pdfFile.name)
                : t('chatHeaderPdf')
              : t('chatHeaderGeneral')
          }
          avatarSrc={avatarSrc}
          userName={session?.user?.name ?? 'U'}
          placeholder={t('chatPlaceholder')}
          disclaimer={t('chatDisclaimer')}
          initializingLabel={t('chatInitializing')}
          typingLabel={t('aiTyping')}
          isRecording={isRecording}
          onVoiceToggle={toggleRecording}
        />
      )}
    </>
  );
}
