'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import { toast } from 'sonner';
import { sendRequest } from '@/utils/api';
import { useLanguage } from '@/context/LanguageContext';
import { usePdf } from '@/context/PdfContext';
import type { Message } from '@/context/PdfContext';
import Image from 'next/image';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';
import ProChatPanel from './ProChatPanel';
import { translations, type Language } from '@/utils/translations';
import { useVoiceInput } from '@/hooks/useVoiceInput';

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

  const handleExtractPagesLocal = useCallback(
    async (startPage: number | undefined, endPage: number | undefined) => {
      if (startPage == null || endPage == null) {
        toast.error(t('toastInvalidRange'));
        return;
      }
      if (!pdfFile) {
        toast.error(t('toastPdfRequired'));
        return;
      }
      if (startPage < 1 || endPage < 1 || endPage < startPage) {
        toast.error(t('toastPagesInvalid'));
        return;
      }
      try {
        const buffer = await pdfFile.arrayBuffer();
        const src = await PDFDocument.load(buffer);
        const pageCount = src.getPageCount();
        if (startPage > pageCount || endPage > pageCount) {
          toast.error(
            t('toastPdfLimit').replace('{count}', pageCount.toString())
          );
          return;
        }
        const dest = await PDFDocument.create();
        const indices: number[] = [];
        for (let p = startPage - 1; p <= endPage - 1; p++) {
          indices.push(p);
        }
        const copied = await dest.copyPages(src, indices);
        copied.forEach((page) => dest.addPage(page));
        const outBytes = await dest.save();
        const base = pdfFile.name.replace(/\.pdf$/i, '') || 'document';
        const outName = `${base}_extracted.pdf`;
        const outFile = new File([new Uint8Array(outBytes)], outName, {
          type: 'application/pdf',
        });
        await savePdf(outFile);
        toast.success(t('toastExtractSuccess'));
      } catch (e) {
        console.error('EXTRACT_PAGES_LOCAL:', e);
        toast.error(t('toastExtractError'));
      }
    },
    [pdfFile, savePdf, t]
  );

  const handleMergePdfsLocal = useCallback(async () => {
    if (pdfList.length < 2) {
      toast.error(t('toastMergeMinFiles'));
      return;
    }
    try {
      const mergedPdf = await PDFDocument.create();
      for (const file of pdfList) {
        const buffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(buffer);
        const indices = pdf.getPageIndices();
        const copied = await mergedPdf.copyPages(pdf, indices);
        copied.forEach((page) => mergedPdf.addPage(page));
      }
      const outBytes = await mergedPdf.save();
      const outFile = new File(
        [new Uint8Array(outBytes)],
        'merged_document.pdf',
        {
          type: 'application/pdf',
        }
      );
      await savePdf(outFile);
      toast.success(t('toastMergeSuccess'));
    } catch (e) {
      console.error('MERGE_PDFS_LOCAL:', e);
      toast.error(t('toastMergeError'));
    }
  }, [pdfList, savePdf, t]);

  const handleClearAllPdfs = useCallback(() => {
    clearPdf();
    toast.info(t('toastClearSuccess'));
  }, [clearPdf, t]);

  const handleSwapPagesLocal = useCallback(
    async (pageA: number, pageB: number) => {
      if (!pdfFile) {
        toast.error(t('toastPdfRequired'));
        return;
      }
      if (pageA < 1 || pageB < 1 || pageA === pageB) {
        toast.error(t('toastPagesInvalid'));
        return;
      }
      try {
        const buffer = await pdfFile.arrayBuffer();
        const src = await PDFDocument.load(buffer);
        const pageCount = src.getPageCount();
        if (pageA > pageCount || pageB > pageCount) {
          toast.error(
            t('toastPdfLimit').replace('{count}', pageCount.toString())
          );
          return;
        }
        const order = Array.from({ length: pageCount }, (_, i) => i + 1);
        const ia = pageA - 1;
        const ib = pageB - 1;
        const next = [...order];
        [next[ia], next[ib]] = [next[ib], next[ia]];
        const dest = await PDFDocument.create();
        const copied = await dest.copyPages(
          src,
          next.map((o) => o - 1)
        );
        copied.forEach((page) => dest.addPage(page));
        const outBytes = await dest.save();
        const outFile = new File([new Uint8Array(outBytes)], pdfFile.name, {
          type: 'application/pdf',
        });
        await savePdf(outFile);
        toast.success(t('toastSwapSuccess'));
      } catch (e) {
        console.error('SWAP_PAGES_LOCAL:', e);
        toast.error(t('toastSwapError'));
      }
    },
    [pdfFile, savePdf, t]
  );

  const applyClientActions = useCallback(
    async (actions: unknown) => {
      if (!Array.isArray(actions)) return;
      for (const raw of actions) {
        if (!raw || typeof raw !== 'object') continue;
        const action = raw as { type?: string; payload?: unknown };
        if (
          action.type === 'EXTRACT_PAGES_LOCAL' &&
          action.payload &&
          typeof action.payload === 'object'
        ) {
          const pl = action.payload as {
            start_page?: number;
            end_page?: number;
          };
          await handleExtractPagesLocal(pl.start_page, pl.end_page);
        }
        if (action.type === 'MERGE_PDFS_LOCAL') {
          await handleMergePdfsLocal();
        }
        if (action.type === 'CLEAR_ALL_PDFS') {
          handleClearAllPdfs();
        }
        if (
          action.type === 'SWAP_PAGES_LOCAL' &&
          action.payload &&
          typeof action.payload === 'object'
        ) {
          const pl = action.payload as { page_a?: number; page_b?: number };
          await handleSwapPagesLocal(Number(pl.page_a), Number(pl.page_b));
        }
      }
    },
    [
      handleExtractPagesLocal,
      handleMergePdfsLocal,
      handleClearAllPdfs,
      handleSwapPagesLocal,
    ]
  );

  const [userRole, setUserRole] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [showProRequiredModal, setShowProRequiredModal] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [typingAudio, setTypingAudio] = useState<HTMLAudioElement | null>(null);
  const translatingIdsRef = useRef<Set<string>>(new Set());
  const pendingAssistantTranslationsRef = useRef<
    Array<{ message: Message; targetIsPdfChat: boolean }>
  >([]);
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

  const activeSessionId = pdfSessionId || generalSessionId;
  const activeChatMessages = pdfSessionId
    ? pdfChatMessages
    : generalChatMessages;
  const supportedLanguages = useMemo<Language[]>(() => ['tr', 'en'], []);
  const isPdfChat = !!pdfSessionId;
  const isProUser =
    userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';
  const canAccessChat = status === 'authenticated' && isProUser;

  type LocalizableChatKey =
    | 'chatWelcomePdf'
    | 'chatWelcomeGeneral'
    | 'chatInitError'
    | 'chatErrorQuotaExceeded'
    | 'chatErrorSessionExpired'
    | 'chatErrorSessionRefresh'
    | 'chatErrorConnection';

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
    []
  );

  const interpolate = useCallback(
    (template: string, params?: Record<string, string>) => {
      if (!params) return template;
      return Object.entries(params).reduce(
        (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
        template
      );
    },
    []
  );

  const makeAssistantMessage = useCallback(
    (key: LocalizableChatKey, params?: Record<string, string>): Message => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: interpolate(t(key), params),
      i18nKey: key,
      i18nParams: params,
      sourceLanguage: language,
      translations: {
        [language]: interpolate(t(key), params),
      },
    }),
    [interpolate, language, t]
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
    [language]
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
          content: interpolate(
            t(message.i18nKey as LocalizableChatKey),
            message.i18nParams
          ),
        };
      }

      for (const key of localizableAssistantKeys) {
        if (key === 'chatWelcomePdf') continue;
        if (
          message.content === translations.tr[key] ||
          message.content === translations.en[key]
        ) {
          return makeAssistantMessage(key);
        }
      }

      const pdfWelcomeMatch =
        message.content.match(/\*\*"(.+?)"\*\*/) ??
        message.content.match(/"(.+?)"/);
      if (pdfWelcomeMatch?.[1]) {
        const name = pdfWelcomeMatch[1];
        const trCandidate = translations.tr.chatWelcomePdf.replace(
          '{name}',
          name
        );
        const enCandidate = translations.en.chatWelcomePdf.replace(
          '{name}',
          name
        );
        if (
          message.content === trCandidate ||
          message.content === enCandidate
        ) {
          return makeAssistantMessage('chatWelcomePdf', { name });
        }
      }

      return message;
    },
    [interpolate, language, makeAssistantMessage, t, localizableAssistantKeys]
  );

  // Başka sayfadan "Sohbet Et" ile açıldığında paneli aç
  useEffect(() => {
    if (proChatOpen) {
      setProChatPanelOpen(true);
      setProChatOpen(false);
    }
  }, [proChatOpen, setProChatOpen, setProChatPanelOpen]);

  const displayChatMessages = useMemo(
    () => activeChatMessages.map(localizeMessageIfPossible),
    [activeChatMessages, localizeMessageIfPossible]
  );

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

  // Dinamik PDF izleyici: pdfFile değiştiğinde Pro ise ve PDF oturumu yoksa arka planda chat session başlat
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
            // Mevcut PDF zaten DB'de kayıtlı; tekrar upload etmeden mevcut id ile başlat.
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
    pdfFile,
    isProUser,
    pdfSessionId,
    existingDocumentId,
    language,
    makeAssistantMessage,
    setPdfSessionId,
    setIsChatActive,
    setPdfChatMessages,
    setActiveSessionDbId,
    loadChatSessions,
  ]);

  useEffect(() => {
    const fetchUserRole = async () => {
      // Auth hydrate tamamlanmadan role isteği atma.
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
      // DB/proxy geç cevap verdiğinde ilk seferde başarısız olabiliyor.
      // Pro yetkisi UI'da bir anda belirlenmediği için FAB tıklanınca modal açılabiliyor.
      // Bu yüzden kısa retry ile userRole set'ini daha stabil hale getiriyoruz.
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
    fetchUserRole();
  }, [session, status]);

  const userId = (session?.user as { id?: string })?.id ?? null;

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
        /* fallback */
      }
      if (session?.user?.image) setAvatarSrc(session.user.image);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, proChatPanelOpen, session?.user]);

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

  const initChatSession = async () => {
    if (activeSessionId) return;
    setInitializing(true);
    try {
      const res = await sendRequest('/files/chat/general/start', 'POST', {
        llm_provider: 'cloud',
        mode: 'flash',
        language: language,
      });
      if (!res.session_id) throw new Error(t('chatInitError'));
      setGeneralSessionId(res.session_id);
      setGeneralChatMessages([makeAssistantMessage('chatWelcomeGeneral')]);
    } catch (e) {
      console.error('Chat başlatma hatası:', e);
      setGeneralChatMessages([makeAssistantMessage('chatInitError')]);
    } finally {
      setInitializing(false);
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
