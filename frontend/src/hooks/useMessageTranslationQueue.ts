import { useCallback, useEffect, useRef } from 'react';
import { sendRequest } from '@/utils/api';
import type { Message } from '@/context/PdfContext';
import type { Language } from '@/utils/translations';

type UseMessageTranslationQueueParams = {
  language: Language;
  loading: boolean;
  supportedLanguages: Language[];
  activeChatMessages: Message[];
  isPdfChat: boolean;
  setPdfChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setGeneralChatMessages: React.Dispatch<React.SetStateAction<Message[]>>;
};

export function useMessageTranslationQueue({
  language,
  loading,
  supportedLanguages,
  activeChatMessages,
  isPdfChat,
  setPdfChatMessages,
  setGeneralChatMessages,
}: UseMessageTranslationQueueParams) {
  const translatingIdsRef = useRef<Set<string>>(new Set());
  const pendingAssistantTranslationsRef = useRef<
    Array<{ message: Message; targetIsPdfChat: boolean }>
  >([]);

  const cacheTranslationForMessage = useCallback(
    (
      id: string,
      targetLanguage: Language,
      translatedText: string,
      targetIsPdfChat: boolean
    ) => {
      const updater = (prev: Message[]) =>
        prev.map((msg) =>
          msg.id === id
            ? {
                ...msg,
                translations: {
                  ...(msg.translations ?? {}),
                  [targetLanguage]: translatedText,
                },
                content:
                  language === targetLanguage ? translatedText : msg.content,
              }
            : msg
        );

      if (targetIsPdfChat) {
        setPdfChatMessages(updater);
      } else {
        setGeneralChatMessages(updater);
      }
    },
    [language, setGeneralChatMessages, setPdfChatMessages]
  );

  const translateAndCacheMessage = useCallback(
    async (message: Message, targetIsPdfChat: boolean) => {
      if (!message.id || message.i18nKey) return;
      if (translatingIdsRef.current.has(message.id)) return;

      const normalizedCurrentLanguage = String(language || 'tr').toLowerCase();
      const rawSourceLanguage = String(
        message.sourceLanguage ?? normalizedCurrentLanguage
      ).toLowerCase();
      const sourceLanguage = (
        supportedLanguages.includes(rawSourceLanguage as Language)
          ? rawSourceLanguage
          : normalizedCurrentLanguage
      ) as Language;
      const currentTranslations = message.translations ?? {};
      const baseText = currentTranslations[sourceLanguage] ?? message.content;
      const needsTranslation = supportedLanguages.some(
        (lang) => lang !== sourceLanguage && !currentTranslations[lang]
      );
      if (!needsTranslation) return;

      translatingIdsRef.current.add(message.id);

      try {
        await Promise.all(
          supportedLanguages
            .filter((lang) => lang !== sourceLanguage)
            .map(async (targetLanguage) => {
              if (message.translations?.[targetLanguage]) return;
              try {
                const res = await sendRequest(
                  '/files/chat/translate-message',
                  'POST',
                  {
                    text: baseText,
                    source_language: sourceLanguage,
                    target_language: targetLanguage,
                  }
                );
                const translated = String(res?.translation ?? '').trim();
                if (!translated) return;
                cacheTranslationForMessage(
                  message.id as string,
                  targetLanguage,
                  translated,
                  targetIsPdfChat
                );
              } catch (error) {
                console.error('Mesaj çevirisi alınamadı:', error);
              }
            })
        );
      } finally {
        translatingIdsRef.current.delete(message.id);
      }
    },
    [cacheTranslationForMessage, language, supportedLanguages]
  );

  useEffect(() => {
    if (loading) return;
    const activeLanguage = String(language || 'tr').toLowerCase() as Language;

    activeChatMessages.forEach((message) => {
      if (!message.id || message.i18nKey) return;
      const sourceCandidate = String(
        message.sourceLanguage ?? activeLanguage
      ).toLowerCase();
      const sourceLanguage = (
        supportedLanguages.includes(sourceCandidate as Language)
          ? sourceCandidate
          : activeLanguage
      ) as Language;
      const hasActiveTranslation = Boolean(
        message.translations?.[activeLanguage]
      );

      if (activeLanguage !== sourceLanguage && !hasActiveTranslation) {
        void translateAndCacheMessage(
          { ...message, sourceLanguage },
          isPdfChat
        );
      }
    });
  }, [
    activeChatMessages,
    isPdfChat,
    language,
    loading,
    supportedLanguages,
    translateAndCacheMessage,
  ]);

  const enqueueAssistantTranslation = useCallback(
    (message: Message, targetIsPdfChat: boolean) => {
      if (!message.id) return;
      const exists = pendingAssistantTranslationsRef.current.some(
        (entry) => entry.message.id === message.id
      );
      if (exists) return;
      pendingAssistantTranslationsRef.current.push({
        message,
        targetIsPdfChat,
      });
    },
    []
  );

  useEffect(() => {
    if (loading) return;
    if (pendingAssistantTranslationsRef.current.length === 0) return;
    const queue = [...pendingAssistantTranslationsRef.current];
    pendingAssistantTranslationsRef.current = [];
    queue.forEach(({ message, targetIsPdfChat }) => {
      void translateAndCacheMessage(message, targetIsPdfChat);
    });
  }, [loading, translateAndCacheMessage]);

  return {
    cacheTranslationForMessage,
    translateAndCacheMessage,
    enqueueAssistantTranslation,
  };
}
