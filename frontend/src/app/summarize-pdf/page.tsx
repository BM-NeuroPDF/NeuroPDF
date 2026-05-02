'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
import { SummarizeBusyOverlay } from '@/components/SummarizeBusyOverlay';
import { SummarizeDropzone } from '@/components/SummarizeDropzone';
import { SummarizePdfWorkArea } from '@/components/SummarizePdfWorkArea';
import { SummaryAudioPlayer } from '@/components/SummaryAudioPlayer';
import { SummaryResultPanel } from '@/components/SummaryResultPanel';

export default function SummarizePdfPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const { t } = useLanguage();
  const { popup, showError, close } = usePopup();
  const {
    usageInfo,
    showLimitModal,
    checkLimit,
    closeLimitModal,
    redirectToLogin,
  } = useGuestLimit();

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

  const [file, setFile] = useState<File | null>(null);

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

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      clearError();

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

      <SummarizeBusyOverlay
        open={summarizing || audioLoading}
        audioLoading={audioLoading}
        t={t}
      />

      <h1 className="text-3xl mb-6 tracking-tight">
        {t('summarizeTitle') || 'PDF Özetleyici'}
      </h1>

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
        <SummarizePdfWorkArea
          file={file}
          summarizing={summarizing}
          onSummarize={() => void summarize()}
          t={t}
        />
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
