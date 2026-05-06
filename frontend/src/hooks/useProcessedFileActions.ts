'use client';

import { useCallback, useState } from 'react';
import type { Session } from 'next-auth';
import { sendRequest } from '@/utils/api';

type SavePdfFn = (file: File | null) => Promise<void> | void;

type UseProcessedFileActionsOptions = {
  session: Session | null | undefined;
  savePdf?: SavePdfFn;
  onError: (error: unknown) => void;
};

type SaveProcessedOptions = {
  blob: Blob;
  filename: string;
  mimeType?: string;
};

export function useProcessedFileActions({
  session,
  savePdf,
  onError,
}: UseProcessedFileActionsOptions) {
  const [saving, setSaving] = useState(false);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, []);

  const saveProcessed = useCallback(
    async ({ blob, filename, mimeType = 'application/pdf' }: SaveProcessedOptions) => {
      if (!session) return null;
      setSaving(true);
      try {
        const fileToSave = new File([blob], filename, { type: mimeType });
        const formData = new FormData();
        formData.append('file', fileToSave);
        formData.append('filename', filename);

        const result = await sendRequest<{ size_kb?: number }>(
          '/files/save-processed',
          'POST',
          formData,
          true,
        );
        if (savePdf) {
          await savePdf(fileToSave);
        }
        return result;
      } catch (error) {
        onError(error);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [onError, savePdf, session],
  );

  const reset = useCallback((clearProcessed?: () => void) => {
    setSaving(false);
    clearProcessed?.();
  }, []);

  return { downloadBlob, saveProcessed, reset, saving };
}
