'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import type { FileRejection } from 'react-dropzone';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import UsageLimitModal from '@/components/UsageLimitModal';
import { usePdf } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { sendRequest } from '@/utils/api';
import { usePdfSummarize } from '@/hooks/usePdfSummarize';
import { getMaxUploadBytes } from '@/app/config/fileLimits';
import Popup from '@/components/ui/Popup';
import { usePopup } from '@/hooks/usePopup';
import { useSummaryAudio } from '@/hooks/useSummaryAudio';
import { SummarizeDropzone } from '@/components/SummarizeDropzone';
import { SummaryAudioPlayer } from '@/components/SummaryAudioPlayer';
import { SummaryResultPanel } from '@/components/SummaryResultPanel';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
});

export default function SummarizePdfPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    pdfFile,
    savePdf,
    clearPdf,
    setSessionId,
    setIsChatActive,
    setChatMessages,
    setProChatOpen,
    setActiveSessionDbId,
    loadChatSessions,
  } = usePdf();

  const { t } = useLanguage();

  const { popup, showError, close } = usePopup();

  const [file, setFile] = useState<File | null>(null);

  // Limit Hesaplama
  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const {
    usageInfo,
    showLimitModal,
    checkLimit,
    closeLimitModal,
    redirectToLogin,
  } = useGuestLimit();

  const resetAudioRef = useRef<(() => void) | null>(null);

  const {
    userRole,
    summary,
    summarizing,
    clearError,
    resetState,
    summarize,
    setErrorType,
    setCustomErrorMsg,
    setSummary,
  } = usePdfSummarize({
    session: session ?? null,
    status,
    file,
    setFile,
    savePdf,
    checkLimit,
    showError,
    t,
    maxBytes,
    resetAudio: () => {
      resetAudioRef.current?.();
    },
    setSessionId,
    setIsChatActive,
    setChatMessages,
    setActiveSessionDbId,
    loadChatSessions,
  });

  const isProUser =
    userRole?.toLowerCase() === 'pro' || userRole?.toLowerCase() === 'pro user';

  const {
    audioUrl,
    audioBlob,
    isPlaying,
    audioLoading,
    currentTime,
    duration,
    audioRef,
    requestAudio,
    togglePlay,
    seek,
    downloadAudio,
    resetAudio,
    skipBy,
    onTimeUpdate,
    onLoadedMetadata,
    onEnded,
    onPause,
    onPlay,
  } = useSummaryAudio({
    summary,
    onClearError: clearError,
    onTtsError: () => setErrorType('AUDIO_ERROR'),
  });

  useEffect(() => {
    resetAudioRef.current = resetAudio;
  }, [resetAudio]);

  // --- DROPZONE AYARLARI ---
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      clearError();

      // Hata Kontrolü
      if (fileRejections.length > 0) {
        const rejection = fileRejections[0];
        const errorObj = rejection.errors[0];

        if (errorObj.code === 'file-invalid-type') {
          setErrorType('INVALID_TYPE');
        } else if (errorObj.code === 'file-too-large') {
          setErrorType('SIZE_EXCEEDED');
        } else {
          setErrorType('CUSTOM');
          setCustomErrorMsg(errorObj.message);
        }
        setFile(null);
        return;
      }

      if (acceptedFiles?.length) {
        const f = acceptedFiles[0];

        if (f.type !== 'application/pdf') {
          setFile(null);
          setErrorType('INVALID_TYPE');
          return;
        }

        if (f.size > maxBytes) {
          setFile(null);
          setErrorType('SIZE_EXCEEDED');
          return;
        }
        resetState(f);
      }
    },
    [maxBytes, resetState, clearError, setErrorType, setCustomErrorMsg, setFile]
  );

  const handleDropFromPanel = (
    e?: React.DragEvent<HTMLDivElement> | React.MouseEvent
  ) => {
    clearError();
    if (pdfFile) {
      if (pdfFile.type !== 'application/pdf') {
        setFile(null);
        setErrorType('INVALID_TYPE');
        return;
      }

      if (pdfFile.size > maxBytes) {
        setFile(null);
        setErrorType('SIZE_EXCEEDED');
        return;
      }
      resetState(pdfFile);
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
        e.preventDefault();
      }
    } else {
      setErrorType('PANEL_ERROR');
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    const f = e.target.files?.[0];
    if (f) {
      if (
        f.type !== 'application/pdf' &&
        !f.name.toLowerCase().endsWith('.pdf')
      ) {
        setFile(null);
        setErrorType('INVALID_TYPE');
        e.target.value = '';
        return;
      }

      if (f.size > maxBytes) {
        setFile(null);
        setErrorType('SIZE_EXCEEDED');
        e.target.value = '';
        return;
      }
      resetState(f);
    }
    e.target.value = '';
  };

  // --- PDF İNDİRME ---
  const handleDownloadPdf = async () => {
    if (!summary) return;
    clearError();
    try {
      const blob = await sendRequest('/files/markdown-to-pdf', 'POST', {
        markdown: summary,
      });
      if (!(blob instanceof Blob)) throw new Error('PDF oluşturulamadı.');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ozet-summary.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setErrorType('PDF_GEN_ERROR');
    }
  };

  const handleNew = () => {
    setFile(null);
    clearPdf();
    setSummary('');
    resetAudio();
    clearError();
    setProChatOpen(false);
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)] relative">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onPause={onPause}
        onPlay={onPlay}
        className="hidden"
      />

      {/* --- YÜKLENİYOR OVERLAY --- */}
      {(summarizing || audioLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
          <div
            className="flex flex-col items-center justify-center p-8 rounded-2xl shadow-2xl border border-[var(--navbar-border)]"
            style={{ backgroundColor: 'var(--container-bg)' }}
          >
            <div className="relative w-20 h-20">
              <div className="absolute top-0 left-0 w-full h-full border-4 border-[var(--navbar-border)] rounded-full opacity-30"></div>
              <div className="absolute top-0 left-0 w-full h-full border-4 border-t-[var(--button-bg)] rounded-full animate-spin"></div>
            </div>

            <h2
              className="mt-6 text-2xl font-bold tracking-tight animate-pulse"
              style={{ color: 'var(--foreground)' }}
            >
              {audioLoading
                ? t('preparingAudio') || 'Ses hazırlanıyor...'
                : t('summarizingStatus') || 'Yapay Zeka Özetliyor...'}
            </h2>

            <p
              className="mt-2 text-sm font-medium opacity-60 max-w-xs text-center"
              style={{ color: 'var(--foreground)' }}
            >
              {audioLoading
                ? t('waitAudioGen') || 'Bu işlem biraz sürebilir...'
                : t('waitMessage') ||
                  'PDF içeriği analiz ediliyor, lütfen bekleyin...'}
            </p>
          </div>
        </div>
      )}

      <h1 className="text-3xl mb-6 tracking-tight">
        {t('summarizeTitle') || 'PDF Özetleyici'}
      </h1>

      {/* Misafir Bilgilendirme */}
      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">{usageInfo.message}</div>
      )}

      <SummarizeDropzone
        maxBytes={maxBytes}
        disabled={summarizing}
        t={t}
        file={file}
        onDrop={onDrop}
        onFileInputChange={handleSelect}
        onPanelDrop={(e) => handleDropFromPanel(e)}
      />

      {file && !summary && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">
            <div
              className="p-4 border-b border-[var(--navbar-border)]"
              style={{ backgroundColor: 'var(--container-bg)' }}
            >
              <h3 className="text-xl font-semibold opacity-90">
                {t('pdfPreviewTitle')}
              </h3>
            </div>
            <PdfViewer file={file} height={550} />
          </div>

          <button
            onClick={() => void summarize()}
            disabled={summarizing}
            className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
              />
            </svg>
            {t('summarizeButton') || 'Özetle'}
          </button>
        </div>
      )}

      {summary && (
        <SummaryResultPanel
          summary={summary}
          file={file}
          userRole={userRole}
          onNew={handleNew}
          onDownloadPdf={() => void handleDownloadPdf()}
          onStartChat={
            session
              ? () => {
                  if (isProUser) setProChatOpen(true);
                  else router.push('/pricing');
                }
              : undefined
          }
          onRequestAudio={session ? () => void requestAudio() : undefined}
          audioUrl={audioUrl}
          audioLoading={audioLoading}
          audioPlayer={
            audioUrl ? (
              <SummaryAudioPlayer
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                audioLoading={audioLoading}
                onTogglePlay={togglePlay}
                onSeek={seek}
                onSkip={skipBy}
                onDownload={session && audioBlob ? downloadAudio : undefined}
                t={t}
              />
            ) : null
          }
          t={t}
        />
      )}

      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={closeLimitModal}
        onLogin={redirectToLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />

      <Popup
        type={popup.type}
        message={popup.message}
        open={popup.open}
        onClose={close}
      />
    </main>
  );
}
