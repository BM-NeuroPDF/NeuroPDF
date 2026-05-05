'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { usePdfActions, usePdfData } from '@/context/PdfContext';
import { useGuestLimit } from '@/hooks/useGuestLimit';
import { guestService } from '@/services/guestService';
import { useLanguage } from '@/context/LanguageContext';
import { getMaxUploadBytes } from '@/app/config/fileLimits';
import { usePopup } from '@/hooks/usePopup';
import { reorderPdfPages, saveReorderedPdfToServer } from '@/hooks/useEditPdfApi';
import { getEditPdfErrorMessage } from '@/components/edit-pdf/editPdfErrorMessage';
import type { EditPdfErrorType, EditPdfPageItem } from '@/components/edit-pdf/editPdfTypes';

export function useEditPdf() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { pdfFile, refreshKey } = usePdfData();
  const { savePdf } = usePdfActions();
  const { t } = useLanguage();
  const { popup, showError, close } = usePopup();

  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [, setNumPages] = useState(0);
  const [pages, setPages] = useState<EditPdfPageItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [isProcessingDone, setIsProcessingDone] = useState(false);
  const [errorType, setErrorType] = useState<EditPdfErrorType>('NONE');
  const [customErrorMsg, setCustomErrorMsg] = useState<string | null>(null);

  const isGuest = status !== 'authenticated';
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, checkLimit, closeLimitModal, redirectToLogin } =
    useGuestLimit();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const pdfOptions = useMemo(() => ({ cMapUrl: '/cmaps/', cMapPacked: true }), []);

  const clearError = useCallback(() => {
    setErrorType('NONE');
    setCustomErrorMsg(null);
  }, []);

  const resetState = useCallback(
    (f: File) => {
      setFile(f);
      setObjectUrl(URL.createObjectURL(f));
      setPages([]);
      setNumPages(0);
      clearError();
      setIsProcessingDone(false);
      setProcessedBlob(null);
    },
    [clearError],
  );

  useEffect(() => {
    if (pathname !== '/edit-pdf') return;
    if (!pdfFile || !file) return;
    if (pdfFile.name !== file.name) return;
    if (pdfFile.size === file.size && pdfFile.lastModified === file.lastModified) return;
    resetState(pdfFile);
  }, [pathname, pdfFile, file, refreshKey, resetState]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      clearError();

      if (fileRejections.length > 0) {
        const errorObj = fileRejections[0].errors[0];
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
    [maxBytes, resetState, clearError],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: maxBytes,
  });

  const handleDropFromPanel = (e?: DragEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
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

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    clearError();
    const f = e.target.files?.[0];
    if (f) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
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

  const handleLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPages(
      Array.from({ length: numPages }, (_, i) => ({
        id: `page-${i + 1}`,
        pageNumber: i + 1,
      })),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        setIsProcessingDone(false);
        setProcessedBlob(null);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleReset = () => {
    setFile(null);
    setObjectUrl(null);
    setPages([]);
    setNumPages(0);
    setIsProcessingDone(false);
    setProcessedBlob(null);
    clearError();
  };

  const handleProcessAndDownload = async () => {
    if (!file) {
      setErrorType('SELECT_PDF_FIRST');
      return;
    }
    const canProceed = await checkLimit();
    if (!canProceed) return;

    clearError();
    try {
      const pageOrder = pages.map((p) => p.pageNumber).join(',');
      const blob = await reorderPdfPages(file, pageOrder);
      if (blob.size === 0) throw new Error('EMPTY_PDF');

      setProcessedBlob(blob);
      setIsProcessingDone(true);
      savePdf(new File([blob], `reordered_${file.name}`, { type: 'application/pdf' }));

      if (!session) {
        try {
          await guestService.incrementUsage();
        } catch (error) {
          console.error('Misafir sayaç hatası:', error);
        }
      }
    } catch (err: unknown) {
      console.error('Reorder Error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'EMPTY_PDF') setErrorType('EMPTY_PDF');
      else {
        setErrorType('REORDER_ERROR');
        setCustomErrorMsg(msg);
      }
    }
  };

  const handleSave = async () => {
    if (!processedBlob || !session || !file) return;
    setSaving(true);
    clearError();
    try {
      const filename = `reordered_${file.name}`;
      const fileToSave = new File([processedBlob], filename, {
        type: 'application/pdf',
      });
      const result = await saveReorderedPdfToServer(fileToSave, filename);
      alert(`${t('saveSuccess')}\n${t('fileSize')}: ${result.size_kb} KB`);
      savePdf(fileToSave);
      handleReset();
    } catch (e: unknown) {
      console.error('Save Error:', e);
      setErrorType('SAVE_ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!processedBlob || !file) return;
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reordered_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentError = useMemo(
    () => getEditPdfErrorMessage(errorType, customErrorMsg, maxBytes, t),
    [errorType, customErrorMsg, maxBytes, t],
  );

  useEffect(() => {
    if (currentError) showError(currentError);
  }, [currentError, showError]);

  return {
    session,
    t,
    popup,
    close,
    file,
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
  };
}
