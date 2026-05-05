import { useCallback, useMemo } from 'react';
import type { Message } from '@/context/PdfContext';
import { translations, type Language } from '@/utils/translations';

type LocalizableChatKey =
  | 'chatWelcomePdf'
  | 'chatWelcomeGeneral'
  | 'chatInitError'
  | 'chatErrorQuotaExceeded'
  | 'chatErrorSessionExpired'
  | 'chatErrorSessionRefresh'
  | 'chatErrorConnection';

type UseChatLocalizationParams<K extends string> = {
  language: Language;
  t: (key: K) => string;
  activeChatMessages: Message[];
};

export function useChatLocalization<K extends string>({
  language,
  t,
  activeChatMessages,
}: UseChatLocalizationParams<K>) {
  const supportedLanguages = useMemo<Language[]>(() => ['tr', 'en'], []);

  const localizableAssistantKeys = useMemo<LocalizableChatKey[]>(
    () => [
      'chatWelcomePdf',
      'chatWelcomeGeneral',
      'chatInitError',
      'chatErrorQuotaExceeded',
      'chatErrorSessionExpired',
      'chatErrorSessionRefresh',
      'chatErrorConnection',
    ],
    [],
  );

  const interpolate = useCallback((template: string, params?: Record<string, string>) => {
    if (!params) return template;
    return Object.entries(params).reduce(
      (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
      template,
    );
  }, []);

  const makeAssistantMessage = useCallback(
    (key: LocalizableChatKey, params?: Record<string, string>): Message => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: interpolate(t(key as K), params),
      i18nKey: key,
      i18nParams: params,
      sourceLanguage: language,
      translations: {
        [language]: interpolate(t(key as K), params),
      },
    }),
    [interpolate, language, t],
  );

  const makeRuntimeMessage = useCallback(
    (role: 'user' | 'assistant', content: string): Message => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      sourceLanguage: language,
      translations: {
        [language]: content,
      },
    }),
    [language],
  );

  const localizeMessageIfPossible = useCallback(
    (message: Message): Message => {
      if (message.translations?.[language]) {
        return {
          ...message,
          content: message.translations[language] as string,
        };
      }
      if (message.role !== 'assistant') return message;

      if (
        message.i18nKey &&
        localizableAssistantKeys.includes(message.i18nKey as LocalizableChatKey)
      ) {
        return {
          ...message,
          content: interpolate(t(message.i18nKey as K), message.i18nParams),
        };
      }

      for (const key of localizableAssistantKeys) {
        if (key === 'chatWelcomePdf') continue;
        if (message.content === translations.tr[key] || message.content === translations.en[key]) {
          return makeAssistantMessage(key);
        }
      }

      const pdfWelcomeMatch =
        message.content.match(/\*\*"(.+?)"\*\*/) ?? message.content.match(/"(.+?)"/);
      if (pdfWelcomeMatch?.[1]) {
        const name = pdfWelcomeMatch[1];
        const trCandidate = translations.tr.chatWelcomePdf.replace('{name}', name);
        const enCandidate = translations.en.chatWelcomePdf.replace('{name}', name);
        if (message.content === trCandidate || message.content === enCandidate) {
          return makeAssistantMessage('chatWelcomePdf', { name });
        }
      }

      return message;
    },
    [interpolate, language, localizableAssistantKeys, makeAssistantMessage, t],
  );

  const displayChatMessages = useMemo(
    () => activeChatMessages.map(localizeMessageIfPossible),
    [activeChatMessages, localizeMessageIfPossible],
  );

  return {
    supportedLanguages,
    localizableAssistantKeys,
    interpolate,
    makeAssistantMessage,
    makeRuntimeMessage,
    localizeMessageIfPossible,
    displayChatMessages,
  };
}
