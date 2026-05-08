'use client';

import { useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react';
import type { Session } from 'next-auth';
import { usePdfToolUpload, type PdfToolUploadError } from '@/hooks/usePdfToolUpload';
import { useProcessedFileActions } from '@/hooks/useProcessedFileActions';
import { useGuestGatedAction } from '@/hooks/useGuestGatedAction';
import { sendRequest } from '@/utils/api';
import { getMaxMergeTotalBytes, getMaxUploadBytes } from '@/app/config/fileLimits';
import type { TranslateFn } from '@/utils/translations';

type ErrorType =
  | 'NONE'
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'TOTAL_SIZE_EXCEEDED'
  | 'CUSTOM'
  | 'MERGE_MIN_FILES'
  | 'PANEL_ERROR'
  | 'FILE_ALREADY_IN_LIST'
  | 'MERGE_ERROR'
  | 'SAVE_ERROR';

type UseMergePdfParams = {
  session: Session | null | undefined;
  status: 'authenticated' | 'loading' | 'unauthenticated';
  panelPdfFile: File | null;
  savePdf: (file: File | null) => Promise<void>;
  checkLimit: () => Promise<boolean>;
  t: TranslateFn;
};

export function useMergePdf({
  session,
  status,
  panelPdfFile,
  savePdf,
  checkLimit,
  t,
}: UseMergePdfParams) {
  const [files, setFiles] = useState<File[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [merging, setMerging] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType>('NONE');
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  const isGuest = status !== 'authenticated';
  const maxBytesPerFile = getMaxUploadBytes(isGuest);
  const maxTotalBytes = getMaxMergeTotalBytes(isGuest);

  const { runWithGuestCheck } = useGuestGatedAction({
    session,
    checkLimit,
    onError: (error) => console.error('Misafir sayaç hatası:', error),
  });

  const clearError = () => {
    setErrorType('NONE');
    setCustomErrorMsg(null);
  };

  const clearFiles = () => {
    setFiles([]);
    setProcessedBlob(null);
    clearError();
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadError = (uploadError: PdfToolUploadError) => {
    clearError();
    if (uploadError.code === 'INVALID_TYPE') {
      setErrorType('INVALID_TYPE');
      return;
    }
    if (uploadError.code === 'SIZE_EXCEEDED') {
      setErrorType('SIZE_EXCEEDED');
      return;
    }
    if (uploadError.code === 'PANEL_ERROR') {
      setErrorType('PANEL_ERROR');
      return;
    }
    setErrorType('CUSTOM');
    setCustomErrorMsg(uploadError.message ?? null);
  };

  const {
    onDrop,
    handleDropFromPanel: handleUploadFromPanel,
    getRootProps,
    getInputProps,
    isDragActive,
  } = usePdfToolUpload({
    maxBytes: maxBytesPerFile,
    allowedTypes: ['application/pdf', '.pdf'],
    onError: handleUploadError,
    onFilesAccepted: (acceptedFiles) => {
      const newFiles: File[] = [];
      let currentTotalSize = files.reduce((acc, f) => acc + f.size, 0);

      for (const file of acceptedFiles) {
        if (currentTotalSize + file.size > maxTotalBytes) {
          setErrorType('TOTAL_SIZE_EXCEEDED');
          return;
        }
        newFiles.push(file);
        currentTotalSize += file.size;
      }
      setFiles((prev) => [...prev, ...newFiles]);
    },
  });

  const { downloadBlob, saveProcessed, saving } = useProcessedFileActions({
    session,
    savePdf,
    onError: (error) => {
      console.error('Save error:', error);
      setErrorType('SAVE_ERROR');
    },
  });

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      onDrop(Array.from(selectedFiles), []);
    }
    e.target.value = '';
  };

  const handleDropFromPanel = (e?: DragEvent<HTMLDivElement> | MouseEvent<HTMLButtonElement>) => {
    clearError();

    if (!panelPdfFile) {
      setErrorType('PANEL_ERROR');
      return;
    }

    if (
      panelPdfFile.type !== 'application/pdf' &&
      !panelPdfFile.name.toLowerCase().endsWith('.pdf')
    ) {
      setErrorType('INVALID_TYPE');
      return;
    }

    if (panelPdfFile.size > maxBytesPerFile) {
      setErrorType('SIZE_EXCEEDED');
      return;
    }

    const currentTotalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (currentTotalSize + panelPdfFile.size > maxTotalBytes) {
      setErrorType('TOTAL_SIZE_EXCEEDED');
      return;
    }

    const isAlreadyInList = files.some(
      (file) => file.name === panelPdfFile.name && file.size === panelPdfFile.size,
    );

    if (isAlreadyInList) {
      setErrorType('FILE_ALREADY_IN_LIST');
      setCustomErrorMsg(panelPdfFile.name);
      return;
    }

    handleUploadFromPanel(panelPdfFile, e);
  };

  const handleMergePdfs = async () => {
    if (files.length < 2) {
      setErrorType('MERGE_MIN_FILES');
      return;
    }

    await runWithGuestCheck(async () => {
      clearError();
      setMerging(true);
      try {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        const blob = await sendRequest<Blob>('/files/merge-pdfs', 'POST', formData, true);
        if (blob.size === 0) throw new Error('Received empty blob from server');
        setProcessedBlob(blob);
        savePdf(new File([blob], 'merged.pdf', { type: 'application/pdf' }));
      } catch (error) {
        console.error('Birleştirme Hatası:', error);
        setErrorType('MERGE_ERROR');
      } finally {
        setMerging(false);
      }
    });
  };

  const handleDownload = () => {
    if (!processedBlob) return;
    downloadBlob(processedBlob, 'merged.pdf');
  };

  const handleSave = async () => {
    if (!processedBlob || !session) return;
    clearError();

    try {
      const result = await saveProcessed({
        blob: processedBlob,
        filename: 'merged.pdf',
        mimeType: 'application/pdf',
      });
      if (!result) return;

      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      clearFiles();
    } catch {
      // saveProcessed already reports errors via onError callback.
    }
  };

  const getErrorMessage = () => {
    if (errorType === 'CUSTOM' && customErrorMsg) return customErrorMsg;

    switch (errorType) {
      case 'INVALID_TYPE':
        return t('invalidFileType');
      case 'SIZE_EXCEEDED':
        return `${t('fileSizeExceeded')} (Max: ${(maxBytesPerFile / (1024 * 1024)).toFixed(0)} MB)`;
      case 'TOTAL_SIZE_EXCEEDED':
        return `${t('totalSizeExceeded')} (Max: ${(maxTotalBytes / (1024 * 1024)).toFixed(0)} MB)`;
      case 'PANEL_ERROR':
        return t('panelPdfError');
      case 'MERGE_MIN_FILES':
        return t('mergeMinFilesError');
      case 'FILE_ALREADY_IN_LIST':
        return `"${customErrorMsg}" ${t('fileAlreadyInList')}`;
      case 'MERGE_ERROR':
        return t('unknownMergeError');
      case 'SAVE_ERROR':
        return t('saveError');
      default:
        return null;
    }
  };

  return {
    files,
    processedBlob,
    merging,
    saving,
    getRootProps,
    getInputProps,
    isDragActive,
    handleSelect,
    handleDropFromPanel,
    removeFile,
    clearFiles,
    handleMergePdfs,
    handleDownload,
    handleSave,
    isReady: files.length >= 2,
    hasProcessed: processedBlob !== null,
    currentError: getErrorMessage(),
  };
}
