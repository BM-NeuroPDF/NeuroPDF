'use client';

import dynamic from 'next/dynamic';
import { useEditPdf } from '@/hooks/useEditPdf';
import EditPdfSidebar from '@/components/edit-pdf/EditPdfSidebar';

const EditPdfCanvas = dynamic(() => import('@/components/edit-pdf/EditPdfCanvas'), {
  ssr: false,
  loading: () => (
    <div className="mt-8 animate-pulse rounded-2xl border border-[var(--navbar-border)] p-6 space-y-4">
      <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="h-32 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-32 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  ),
});

const EditPdfToolbar = dynamic(() => import('@/components/edit-pdf/EditPdfToolbar'), {
  loading: () => (
    <div className="mt-8 flex gap-3">
      <div className="h-10 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
      <div className="h-10 w-28 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
    </div>
  ),
});

const EditPdfDialogs = dynamic(() => import('@/components/edit-pdf/EditPdfDialogs'));

/**
 * Dynamic import boundaries live in `@/components/edit-pdf/EditPdfDocument`
 * (react-pdf Document/Page + pdf.js worker). Further code-splitting is deferred (M7/TW3).
 */
export default function EditPdfPage() {
  const {
    session,
    t,
    popup,
    close,
    objectUrl,
    pages,
    isProcessingDone,
    processedBlob,
    saving,
    sensors,
    pdfOptions,
    getRootProps,
    getInputProps,
    isDragActive,
    handleDropFromPanel,
    handleSelect,
    handleDragEnd,
    handleReset,
    handleProcessAndDownload,
    handleSave,
    handleDownload,
    handleLoadSuccess,
    currentError,
    usageInfo,
    showLimitModal,
    closeLimitModal,
    redirectToLogin,
  } = useEditPdf();

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto font-bold text-[var(--foreground)]">
      <EditPdfSidebar
        title={t('editPageTitle')}
        session={session}
        usageInfo={usageInfo}
        showLimitModal={showLimitModal}
        currentError={currentError}
        getRootProps={getRootProps}
        getInputProps={getInputProps}
        isDragActive={isDragActive}
        onDropFromPanel={handleDropFromPanel}
        onFileInputChange={handleSelect}
        t={t}
      />

      <EditPdfCanvas
        objectUrl={objectUrl}
        isProcessingDone={isProcessingDone}
        pages={pages}
        sensors={sensors}
        onDragEnd={handleDragEnd}
        onLoadSuccess={handleLoadSuccess}
        pdfOptions={pdfOptions}
        t={t}
      />

      <EditPdfToolbar
        objectUrl={objectUrl}
        isProcessingDone={isProcessingDone}
        processedBlob={processedBlob}
        pagesLength={pages.length}
        session={session}
        saving={saving}
        onProcessAndDownload={handleProcessAndDownload}
        onReset={handleReset}
        onDownload={handleDownload}
        onSave={handleSave}
        t={t}
      />

      <EditPdfDialogs
        showLimitModal={showLimitModal}
        onCloseLimitModal={closeLimitModal}
        onLogin={redirectToLogin}
        usageInfo={usageInfo}
        popup={popup}
        onClosePopup={close}
      />
    </main>
  );
}
