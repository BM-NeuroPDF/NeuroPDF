'use client';

import { useDropzone, type FileRejection } from 'react-dropzone';
import type { ChangeEvent, DragEvent } from 'react';
import { translations } from '@/utils/translations';

export interface SummarizeDropzoneProps {
  maxBytes: number;
  disabled?: boolean;
  t: (key: keyof (typeof translations)['tr']) => string;
  file: File | null;
  onDrop: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPanelDrop: (e: DragEvent<HTMLElement>) => void;
}

export function SummarizeDropzone({
  maxBytes,
  disabled = false,
  t,
  file,
  onDrop,
  onFileInputChange,
  onPanelDrop,
}: SummarizeDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: maxBytes,
    disabled,
  });

  return (
    <>
      <div
        {...getRootProps({
          onDrop: (e: DragEvent<HTMLElement>) => {
            const isPanel = e.dataTransfer.getData('application/x-neuro-pdf');
            if (isPanel) {
              onPanelDrop(e);
            }
          },
        })}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
          ${
            isDragActive
              ? 'border-[var(--button-bg)] bg-[var(--background)] opacity-80'
              : 'border-[var(--navbar-border)] hover:border-[var(--button-bg)]'
          }`}
      >
        <input {...getInputProps()} accept="application/pdf" />
        <div className="flex flex-col items-center gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-12 h-12 opacity-50"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          {isDragActive ? <p>{t('dropActive')}</p> : <p>{t('dropPassive')}</p>}
        </div>

        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t('currentFile')} <b>{file.name}</b> <br /> {t('changeFileHint')}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-start">
        <label
          className={`btn-primary shadow-md hover:scale-105 flex items-center gap-2 ${
            disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
          }`}
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
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          {t('selectFile')}
          <input
            type="file"
            className="hidden"
            accept=".pdf"
            disabled={disabled}
            onChange={onFileInputChange}
          />
        </label>
      </div>
    </>
  );
}
