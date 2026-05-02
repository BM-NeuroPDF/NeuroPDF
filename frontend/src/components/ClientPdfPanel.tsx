'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { usePdf } from '@/context/PdfContext';
import { useLanguage } from '@/context/LanguageContext';
import { useDropzone } from 'react-dropzone';

export const CLIENT_PDF_PANEL_HIDDEN_PATHS = [
  '/',
  '/login',
  '/register',
  '/profile',
] as const;

function formatRelativeTime(
  iso: string | null | undefined,
  lang: 'tr' | 'en'
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diffSec = Math.round((d.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'tr', {
    numeric: 'auto',
  });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  return rtf.format(diffMonth, 'month');
}

export default function ClientPdfPanel() {
  const pathname = usePathname();
  const { status } = useSession();
  const {
    pdfFile,
    pdfList,
    addPdfs,
    removePdf,
    setActivePdf,
    clearPdf,
    chatSessions,
    chatSessionsLoading,
    activeSessionDbId,
    restoreSession,
  } = usePdf();
  const { t, language } = useLanguage();

  /** ResponsivePdfPanel ile senkron tutulmalı */
  const hiddenPaths = CLIENT_PDF_PANEL_HIDDEN_PATHS;

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length) addPdfs(acceptedFiles);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: { 'application/pdf': ['.pdf'] },
    noClick: true,
  });

  const showPanel =
    !(hiddenPaths as readonly string[]).includes(pathname) &&
    (pdfList.length > 0 || status === 'authenticated');

  if (!showPanel) return null;

  const lang = language === 'en' ? 'en' : 'tr';

  return (
    <aside
      {...getRootProps()}
      className={`w-80 h-full flex flex-col border-l transition-all duration-300 shadow-xl z-20
        ${isDragActive ? 'bg-red-50 border-red-500 dark:bg-red-950/20' : ''}
      `}
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--navbar-border)',
        color: 'var(--foreground)',
      }}
    >
      <input {...getInputProps()} />

      {pdfList.length > 0 ? (
        <>
          <div
            className="p-6 border-b"
            style={{ borderColor: 'var(--navbar-border)' }}
          >
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              {t('pdfDocumentsTitle')}
            </h2>
            <p className="text-xs opacity-60 mt-1 font-medium">
              {t('dragToUse')}
            </p>
          </div>

          <div className="p-4 flex flex-col gap-2 overflow-y-auto max-h-[40vh]">
            {pdfList.map((f) => {
              const isActive = pdfFile?.name === f.name;
              return (
                <div
                  key={f.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActivePdf(f.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActivePdf(f.name);
                    }
                  }}
                  draggable
                  onDragStart={(e) => {
                    try {
                      e.dataTransfer.effectAllowed = 'copy';
                      e.currentTarget.style.opacity = '0.5';
                      const file = new File([f], f.name || 'document.pdf', {
                        type: f.type || 'application/pdf',
                        lastModified: f.lastModified || Date.now(),
                      });
                      if (e.dataTransfer.items?.add) {
                        e.dataTransfer.items.add(file);
                      }
                      try {
                        const meta = {
                          name: file.name,
                          type: file.type || 'application/pdf',
                          size: file.size,
                          source: 'panel',
                        } as const;
                        e.dataTransfer.setData(
                          'application/x-neuro-pdf',
                          JSON.stringify(meta)
                        );
                      } catch {}
                    } catch {}
                  }}
                  onDragEnd={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  className={`group relative p-3 rounded-xl border shadow-sm cursor-grab active:cursor-grabbing transition-all hover:shadow-md text-left outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 ${
                    isActive
                      ? 'ring-2 ring-[var(--button-bg)] border-[var(--button-bg)]'
                      : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--container-bg)',
                    borderColor: 'var(--navbar-border)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">
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
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold text-sm truncate"
                        title={f.name}
                      >
                        {f.name}
                      </p>
                      <p className="text-xs opacity-60 mt-0.5 font-mono">
                        {(f.size / 1024).toFixed(1)} KB
                      </p>
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wide mt-1 inline-block text-[var(--button-bg)]">
                          {t('activePdfBadge')}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePdf(f.name);
                      }}
                      className="opacity-70 group-hover:opacity-100 p-1.5 rounded-full hover:bg-red-100 text-red-500 transition-all shrink-0 dark:hover:bg-red-900/30"
                      title={t('removeFromList')}
                      aria-label={t('removeFromList')}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <div
                    className="mt-2 flex items-center gap-1 text-[10px] font-bold opacity-70"
                    style={{ color: 'var(--button-bg)' }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-3 h-3"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                      />
                    </svg>
                    {t('dragHint')}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {status === 'authenticated' ? (
        <div
          className="flex flex-col flex-1 min-h-0 border-t"
          style={{ borderColor: 'var(--navbar-border)' }}
        >
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold tracking-tight opacity-90">
              {t('chatHistoryTitle')}
            </h3>
          </div>
          <div className="px-4 pb-4 flex-1 overflow-y-auto flex flex-col gap-2">
            {chatSessionsLoading ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg animate-pulse bg-gray-200/80 dark:bg-gray-700/80"
                  />
                ))}
              </div>
            ) : chatSessions.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed px-1 py-2">
                {t('chatHistoryEmpty')}
              </p>
            ) : (
              chatSessions.map((item) => {
                const title = item.pdf_name || item.title || 'document.pdf';
                const rel = formatRelativeTime(item.updated_at, lang);
                const isSel = activeSessionDbId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void restoreSession(item.id)}
                    className={`min-w-0 w-full text-left p-3 rounded-lg border transition-colors duration-200 cursor-pointer ${
                      isSel
                        ? 'bg-[var(--button-bg)]/15 ring-2 ring-[var(--button-bg)]/40 border-[var(--button-bg)]/30'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100 dark:bg-gray-800/40 dark:border-gray-700/50 dark:hover:bg-gray-700/60'
                    }`}
                  >
                    <div className="min-w-0 w-full">
                      <p
                        className="font-semibold text-sm min-w-0 truncate overflow-hidden text-ellipsis whitespace-nowrap text-slate-900 dark:text-black"
                        title={title}
                      >
                        {title}
                      </p>
                      {rel ? (
                        <p className="text-[11px] text-gray-700 dark:text-black/70 mt-0.5 truncate min-w-0">
                          {rel}
                        </p>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {pdfList.length > 0 ? (
        <div
          className="p-4 border-t mt-auto"
          style={{
            borderColor: 'var(--navbar-border)',
            backgroundColor: 'var(--container-bg)',
          }}
        >
          <button
            type="button"
            onClick={clearPdf}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-95 bg-red-600 hover:bg-red-700"
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
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            {t('clearAllPdfs')}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
