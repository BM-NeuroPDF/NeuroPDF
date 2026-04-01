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
import Image from 'next/image';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';
import ProChatPanel from './ProChatPanel';

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
        toast.error('Geçersiz sayfa aralığı.');
        return;
      }
      if (!pdfFile) {
        toast.error(
          'Tarayıcıda kesim için açık bir PDF gerekir. Lütfen bir dosya yükleyin.'
        );
        return;
      }
      if (startPage < 1 || endPage < 1 || endPage < startPage) {
        toast.error('Sayfa numaraları geçersiz.');
        return;
      }
      try {
        const buffer = await pdfFile.arrayBuffer();
        const src = await PDFDocument.load(buffer);
        const pageCount = src.getPageCount();
        if (startPage > pageCount || endPage > pageCount) {
          toast.error(`PDF yalnızca ${pageCount} sayfa içeriyor.`);
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
        toast.success('Sayfalar başarıyla ayrıldı ve ekrana yüklendi.');
      } catch (e) {
        console.error('EXTRACT_PAGES_LOCAL:', e);
        toast.error('PDF kesilemedi. Lütfen tekrar deneyin.');
      }
    },
    [pdfFile, savePdf]
  );

  const handleMergePdfsLocal = useCallback(async () => {
    if (pdfList.length < 2) {
      toast.error(
        'Birleştirmek için en az iki PDF gerekir. Lütfen yan panele birden fazla dosya ekleyin.'
      );
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
      toast.success('Tüm PDF dosyaları başarıyla birleştirildi');
    } catch (e) {
      console.error('MERGE_PDFS_LOCAL:', e);
      toast.error(
        'PDF birleştirilemedi. Lütfen dosyaları kontrol edip tekrar deneyin.'
      );
    }
  }, [pdfList, savePdf]);

  const handleClearAllPdfs = useCallback(() => {
    clearPdf();
    toast.info('Ekrandaki tüm dosyalar temizlendi.');
  }, [clearPdf]);

  const handleSwapPagesLocal = useCallback(
    async (pageA: number, pageB: number) => {
      if (!pdfFile) {
        toast.error(
          'Tarayıcıda sıralama için açık bir PDF gerekir. Lütfen bir dosya yükleyin.'
        );
        return;
      }
      if (pageA < 1 || pageB < 1 || pageA === pageB) {
        toast.error('Geçersiz sayfa numaraları.');
        return;
      }
      try {
        const buffer = await pdfFile.arrayBuffer();
        const src = await PDFDocument.load(buffer);
        const pageCount = src.getPageCount();
        if (pageA > pageCount || pageB > pageCount) {
          toast.error(`PDF yalnızca ${pageCount} sayfa içeriyor.`);
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
        toast.success('Sayfalar yer değiştirildi; PDF güncellendi.');
      } catch (e) {
        console.error('SWAP_PAGES_LOCAL:', e);
        toast.error('Sayfa yer değiştirme başarısız.');
      }
    },
    [pdfFile, savePdf]
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
  const [typingAudio, setTypingAudio] = useState<HTMLAudioElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

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
  const isPdfChat = !!pdfSessionId;
  const isProUser =
    userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';
  const canAccessChat = status === 'authenticated' && isProUser;

  // Başka sayfadan "Sohbet Et" ile açıldığında paneli aç
  useEffect(() => {
    if (proChatOpen) {
      setProChatPanelOpen(true);
      setProChatOpen(false);
    }
  }, [proChatOpen, setProChatOpen, setProChatPanelOpen]);

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
          });
        } else {
          const formData = new FormData();
          formData.append('file', pdfFile);
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
            {
              role: 'assistant',
              content: `👋 Merhaba! **"${pdfFile.name}"** dosyasını analiz ettim. Bana bu belgeyle ilgili her şeyi sorabilirsin.`,
            },
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
    setPdfSessionId,
    setIsChatActive,
    setPdfChatMessages,
    setActiveSessionDbId,
    loadChatSessions,
  ]);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (status === 'authenticated' && session) {
        try {
          const data = await sendRequest('/files/user/stats', 'GET');
          setUserRole(data?.role ?? null);
        } catch (error: unknown) {
          const msg =
            error && typeof error === 'object' && 'message' in error
              ? String((error as { message?: string }).message)
              : '';
          if (
            msg.includes('Oturum süreniz dolmuş') ||
            msg.includes('expired') ||
            msg.includes('401')
          ) {
            setUserRole(null);
          } else {
            console.error('Rol kontrolü hatası:', error);
          }
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

  // --- Voice Input (Speech-to-Text) Logic ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recog = new SpeechRecognition();
    recog.continuous = false;
    recog.interimResults = false;
    recog.lang = language === 'tr' ? 'tr-TR' : 'en-US';

    console.log('SpeechRecognition initialized for language:', recog.lang);

    recog.onstart = () => {
      console.log('SpeechRecognition.onstart: Voice session started.');
    };

    recog.onspeechstart = () => {
      console.log('SpeechRecognition.onspeechstart: Speech detected.');
    };

    recog.onspeechend = () => {
      console.log('SpeechRecognition.onspeechend: Speech ended.');
    };

    recog.onsoundstart = () => {
      console.log(
        'SpeechRecognition.onsoundstart: Sound detected (hardware level).'
      );
    };

    recog.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        console.log('SpeechRecognition.onresult (final):', finalTranscript);
        setInput((prev) => {
          const trimmed = prev.trim();
          return trimmed ? trimmed + ' ' + finalTranscript : finalTranscript;
        });
      }
    };

    recog.onerror = (event: any) => {
      console.error('SpeechRecognition.onerror:', event.error);
      const errorMsg =
        event.error === 'no-speech'
          ? 'Ses algılanamadı, mikrofonu kontrol edin.'
          : event.error === 'not-allowed'
            ? 'Mikrofon izni reddedildi.'
            : event.error === 'network'
              ? 'Ses tanıma sunucusuna güvenli bağlantı kurulamadı. Chrome kullandığınızdan veya internet bağlantınızdan emin olun.'
              : `Hata: ${event.error}`;
      toast.error(errorMsg);
      setIsRecording(false);
    };

    recog.onend = () => {
      console.log('SpeechRecognition.onend: Session ended cycle.');
      setIsRecording(false);
    };

    recognitionRef.current = recog;

    // Cleanup: Bileşen unmount olduğunda veya dil değiştiğinde eski dinleyiciyi kapat
    return () => {
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
        }
      } catch (e) {
        console.error('Cleanup error:', e);
      }
    };
  }, [language]);

  const ensureMicrophoneAccess = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Tarayıcınız mikrofon erişimini desteklemiyor.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      const err = error as DOMException;
      if (err?.name === 'NotAllowedError') {
        alert(
          'Mikrofon izni reddedildi. Lütfen site ayarlarından mikrofona izin verin.'
        );
      } else if (err?.name === 'NotFoundError') {
        alert('Mikrofon bulunamadı. Lütfen bir mikrofon bağlayın.');
      } else {
        alert(
          'Mikrofon başlatılamadı. Lütfen tarayıcı izinlerini kontrol edin.'
        );
      }
      return false;
    }
  };

  const handleVoiceToggle = async () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert('Tarayıcınız ses tanıma özelliğini desteklemiyor.');
      return;
    }

    if (isRecording) {
      console.log('Attempting to stop recording manually...');
      recognition.stop();
      setIsRecording(false);
    } else {
      try {
        const hasPermission = await ensureMicrophoneAccess();
        if (!hasPermission) return;

        console.log('Attempting to start recording (Single-Shot)...');
        recognition.stop();
        setTimeout(() => {
          recognition.start();
          setIsRecording(true);
        }, 100);
      } catch (e: any) {
        console.error('Recognition start error:', e);
        if (String(e?.message || '').includes('not-allowed')) {
          alert('Mikrofon izni reddedildi. Sayfayı yenileyip tekrar deneyin.');
        }
        setIsRecording(false);
      }
    }
  };

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
      });
      if (!res.session_id) throw new Error('Oturum açılamadı.');
      setGeneralSessionId(res.session_id);
      setGeneralChatMessages([
        {
          role: 'assistant',
          content:
            '👋 Merhaba! Ben NeuroPDF AI asistanıyım. Size nasıl yardımcı olabilirim? PDF işlemleri, dosya yönetimi veya genel sorularınız için buradayım.',
        },
      ]);
    } catch (e) {
      console.error('Chat başlatma hatası:', e);
      setGeneralChatMessages([
        {
          role: 'assistant',
          content: '🚫 Sohbet başlatılamadı. Lütfen tekrar deneyin.',
        },
      ]);
    } finally {
      setInitializing(false);
    }
  };

  const handleFabClick = () => {
    if (status !== 'authenticated') {
      router.push('/pricing');
      return;
    }
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
        { text: 'Bu belgenin özetini çıkar', icon: '📝' },
        { text: 'Bu belgeyi İngilizceye çevir', icon: '🌐' },
        { text: 'Bu belgenin sayfalarını ayır', icon: '✂️' },
        { text: 'Ekranı temizle', icon: '🧹' },
      ];
    }
    return [
      { text: 'Bu dosyaları birleştir', icon: '✨' },
      { text: 'Ekranı temizle', icon: '🧹' },
    ];
  }, [pdfList.length]);

  const handleSend = async (messageOverride?: string) => {
    const userMsg = (messageOverride ?? input).trim();
    if (!userMsg || !activeSessionId) return;
    if (isRecording && recognitionRef.current) recognitionRef.current.stop();
    setInput('');

    if (isPdfChat) {
      setPdfChatMessages((prev) => [
        ...prev,
        { role: 'user', content: userMsg },
      ]);
    } else {
      setGeneralChatMessages((prev) => [
        ...prev,
        { role: 'user', content: userMsg },
      ]);
    }
    setLoading(true);

    try {
      const endpoint = isPdfChat
        ? '/api/proxy/chat/message'
        : '/files/chat/general/message';
      const res = await sendRequest(endpoint, 'POST', {
        session_id: activeSessionId,
        message: userMsg,
      });
      if (isPdfChat) {
        setPdfChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.answer },
        ]);
        await applyClientActions(res.client_actions);
        void loadChatSessions();
      } else {
        setGeneralChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.answer },
        ]);
        await applyClientActions(res.client_actions);
      }

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
        const errorMsg =
          '⚠️ Gemini API kotası aşıldı. Local LLM kullanmak için profil sayfasından ayarları değiştirin.';
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: errorMsg },
          ]);
        } else {
          setGeneralChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: errorMsg },
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
          const errorMsg =
            "⚠️ PDF chat oturumu sona erdi. Lütfen PDF'i tekrar yükleyin.";
          setPdfChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: errorMsg },
          ]);
        } else {
          try {
            const res = await sendRequest('/files/chat/general/start', 'POST', {
              llm_provider: 'cloud',
              mode: 'flash',
            });
            if (res.session_id) {
              setGeneralSessionId(res.session_id);
              const retryRes = await sendRequest(
                '/files/chat/general/message',
                'POST',
                {
                  session_id: res.session_id,
                  message: userMsg,
                }
              );
              setGeneralChatMessages((prev) => [
                ...prev,
                { role: 'assistant', content: retryRes.answer },
              ]);
              await applyClientActions(retryRes.client_actions);

              // Bildirim sesi çal (Retry sonrası da 2 defa)
              const playNotify = () => {
                const audio = new Audio('/sounds/notification.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => {});
              };
              playNotify();
              setTimeout(playNotify, 600);
            } else {
              throw new Error('Yeni session başlatılamadı');
            }
          } catch (retryError) {
            console.error('Session yenileme hatası:', retryError);
            setGeneralChatMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: '⚠️ Oturum yenilenemedi. Lütfen sayfayı yenileyin.',
              },
            ]);
          }
        }
      } else {
        const errorMsg = '⚠️ Bağlantı hatası. Lütfen tekrar deneyin.';
        if (isPdfChat) {
          setPdfChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: errorMsg },
          ]);
        } else {
          setGeneralChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: errorMsg },
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
                  {t('chatWelcomeGlobal') || 'Merhaba! Neuro AI buradayım.'}
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
              aria-label="AI Asistanı"
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
                Pro Üyelik Gerekli
              </h3>
              <p className="text-sm opacity-80 mb-6">
                AI sohbet özelliği Pro üyeliği gerektirir. Devam etmek için
                fiyatlandırma sayfasına gidebilirsiniz.
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
                  Kapat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowProRequiredModal(false);
                    router.push('/pricing');
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Fiyatlandırmaya Git
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
          messages={activeChatMessages}
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
                ? `Analiz: ${pdfFile.name}`
                : 'PDF AI Asistanı'
              : 'Genel AI Asistanı'
          }
          avatarSrc={avatarSrc}
          userName={session?.user?.name ?? 'U'}
          placeholder={t('chatPlaceholder') || 'Sorunuzu yazın...'}
          disclaimer={
            t('chatDisclaimer') ||
            'NeuroPDF yapay zekası bazen hata yapabilir. Lütfen bilgileri kontrol edin.'
          }
          initializingLabel="Başlatılıyor..."
          typingLabel={t('aiTyping') || 'Neuro yanıt yazıyor...'}
          isRecording={isRecording}
          onVoiceToggle={handleVoiceToggle}
        />
      )}
    </>
  );
}
