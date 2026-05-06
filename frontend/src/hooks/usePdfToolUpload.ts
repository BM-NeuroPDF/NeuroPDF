'use client';

import { useCallback, type DragEvent, type MouseEvent } from 'react';
import { useDropzone, type DropzoneOptions, type FileRejection } from 'react-dropzone';

export type PdfToolUploadErrorCode =
  | 'INVALID_TYPE'
  | 'SIZE_EXCEEDED'
  | 'MAX_FILES_EXCEEDED'
  | 'PANEL_ERROR'
  | 'CUSTOM';

export type PdfToolUploadError = {
  code: PdfToolUploadErrorCode;
  message?: string;
};

type UsePdfToolUploadOptions = {
  maxBytes: number;
  maxFiles?: number;
  allowedTypes?: string[];
  onFilesAccepted: (files: File[]) => void;
  onError: (error: PdfToolUploadError) => void;
};

const DEFAULT_ALLOWED_TYPES = ['application/pdf', '.pdf'];

function isAllowedFile(file: File, allowedTypes: string[]): boolean {
  const lowerName = file.name.toLowerCase();
  return allowedTypes.some((allowed) => {
    if (allowed.startsWith('.')) {
      return lowerName.endsWith(allowed.toLowerCase());
    }
    return file.type === allowed;
  });
}

function normalizeDropzoneError(rejection: FileRejection): PdfToolUploadError {
  const errorObj = rejection.errors[0];
  if (!errorObj) return { code: 'CUSTOM', message: 'Unknown file rejection' };
  if (errorObj.code === 'file-invalid-type') return { code: 'INVALID_TYPE' };
  if (errorObj.code === 'file-too-large') return { code: 'SIZE_EXCEEDED' };
  if (errorObj.code === 'too-many-files') return { code: 'MAX_FILES_EXCEEDED' };
  return { code: 'CUSTOM', message: errorObj.message };
}

export function usePdfToolUpload({
  maxBytes,
  maxFiles,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  onFilesAccepted,
  onError,
}: UsePdfToolUploadOptions) {
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      if (fileRejections.length > 0) {
        onError(normalizeDropzoneError(fileRejections[0]));
        return;
      }
      if (!acceptedFiles.length) return;

      if (maxFiles && acceptedFiles.length > maxFiles) {
        onError({ code: 'MAX_FILES_EXCEEDED' });
        return;
      }

      for (const file of acceptedFiles) {
        if (!isAllowedFile(file, allowedTypes)) {
          onError({ code: 'INVALID_TYPE' });
          return;
        }
        if (file.size > maxBytes) {
          onError({ code: 'SIZE_EXCEEDED' });
          return;
        }
      }

      onFilesAccepted(acceptedFiles);
    },
    [allowedTypes, maxBytes, maxFiles, onError, onFilesAccepted],
  );

  const handleDropFromPanel = useCallback(
    (panelFile: File | null, e?: DragEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
      if (!panelFile) {
        onError({ code: 'PANEL_ERROR' });
        return;
      }
      if (!isAllowedFile(panelFile, allowedTypes)) {
        onError({ code: 'INVALID_TYPE' });
        return;
      }
      if (panelFile.size > maxBytes) {
        onError({ code: 'SIZE_EXCEEDED' });
        return;
      }

      onFilesAccepted([panelFile]);
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    [allowedTypes, maxBytes, onError, onFilesAccepted],
  );

  const accept: DropzoneOptions['accept'] = {
    'application/pdf': ['.pdf'],
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: maxFiles === undefined ? true : maxFiles > 1,
    accept,
    maxSize: maxBytes,
    maxFiles,
  });

  return {
    onDrop,
    handleDropFromPanel,
    getRootProps,
    getInputProps,
    isDragActive,
  };
}
