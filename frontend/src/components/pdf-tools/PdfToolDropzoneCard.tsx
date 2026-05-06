'use client';

import type { ChangeEvent } from 'react';

type Translate = (key: string) => string;

type PdfToolDropzoneCardProps = {
  getRootProps: (props?: Record<string, unknown>) => Record<string, unknown>;
  getInputProps: (props?: Record<string, unknown>) => Record<string, unknown>;
  isDragActive: boolean;
  files: File[];
  onRemove?: (index: number) => void;
  t: Translate;
  onSelect?: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearAll?: () => void;
  multiple?: boolean;
  dropActiveLabel?: string;
  dropPassiveLabel?: string;
  currentFileHint?: string;
  rootProps?: Record<string, unknown>;
};

export default function PdfToolDropzoneCard({
  getRootProps,
  getInputProps,
  isDragActive,
  files,
  onRemove,
  t,
  onSelect,
  onClearAll,
  multiple = false,
  dropActiveLabel,
  dropPassiveLabel,
  currentFileHint,
  rootProps,
}: PdfToolDropzoneCardProps) {
  return (
    <>
      <div
        {...getRootProps({ role: 'button', ...rootProps })}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
          isDragActive
            ? 'border-[var(--button-bg)] opacity-80 bg-[var(--background)]'
            : 'border-[var(--navbar-border)] hover:border-[var(--button-bg)]'
        }`}
      >
        <input {...getInputProps()} />
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
          {isDragActive ? (
            <p>{dropActiveLabel ?? t('dropActive')}</p>
          ) : (
            <p>{dropPassiveLabel ?? t('dropPassive')}</p>
          )}
        </div>

        {files.length > 0 && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">{currentFileHint}</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('selectFile')}
          <input
            type="file"
            accept="application/pdf"
            multiple={multiple}
            onChange={onSelect}
            className="hidden"
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-4 text-sm opacity-80">
          {t('selectedFiles')} ({files.length})
        </div>
      )}

      {files.length > 0 && onRemove && (
        <ul className="container-card space-y-2 p-4 mt-4">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex justify-between items-center text-sm p-2"
            >
              <span>
                {file.name} ({Math.round(file.size / 1024)} KB)
              </span>
              <button onClick={() => onRemove(index)} className="text-sm underline" type="button">
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && onClearAll && (
        <button type="button" onClick={onClearAll} className="mt-3 text-sm underline">
          {t('clearAll')}
        </button>
      )}
    </>
  );
}
