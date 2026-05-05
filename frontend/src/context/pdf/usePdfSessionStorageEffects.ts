import { useEffect, useRef, useState, type Dispatch } from 'react';
import { STORAGE_KEY, type PdfAction } from './pdfModel';

/**
 * Restores PDF from sessionStorage on mount; persists active PDF as data URL when it changes.
 */
export function usePdfSessionStorageEffects(
  dispatch: Dispatch<PdfAction>,
  activeFile: File | null,
  onAfterPersist: () => void,
): boolean {
  const [hydrated, setHydrated] = useState(false);
  const persistEpochRef = useRef(0);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const byteString = atob(stored.split(',')[1]);
        const array = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) array[i] = byteString.charCodeAt(i);
        const blob = new Blob([array], { type: 'application/pdf' });
        const file = new File([blob], 'restored_document.pdf', {
          type: 'application/pdf',
        });
        dispatch({ type: 'HYDRATE', file });
      }
    } catch (e) {
      console.error('PDF kurtarma hatası:', e);
      sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated) return;
    const myEpoch = ++persistEpochRef.current;
    if (!activeFile) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (myEpoch !== persistEpochRef.current) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, reader.result as string);
      } catch {
        console.warn("⚠️ PDF çok büyük, sessionStorage'a kaydedilemedi.");
      }
      onAfterPersist();
    };
    reader.readAsDataURL(activeFile);
  }, [activeFile, hydrated, onAfterPersist]);

  return hydrated;
}
