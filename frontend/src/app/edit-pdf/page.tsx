'use client';

import { useEditPdf } from '@/hooks/useEditPdf';
import EditPdfCanvas from '@/components/edit-pdf/EditPdfCanvas';
import EditPdfDialogs from '@/components/edit-pdf/EditPdfDialogs';
import EditPdfSidebar from '@/components/edit-pdf/EditPdfSidebar';
import EditPdfToolbar from '@/components/edit-pdf/EditPdfToolbar';

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
