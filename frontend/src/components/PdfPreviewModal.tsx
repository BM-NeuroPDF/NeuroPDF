'use client';

import { X } from 'lucide-react';
import PdfViewer from './PdfViewer';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: Blob | File | string | null;
  title: string;
}

export default function PdfPreviewModal({
  isOpen,
  onClose,
  file,
  title,
}: PdfPreviewModalProps) {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-[var(--background)] border border-[var(--container-border)] rounded-3xl shadow-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--container-border)] bg-[var(--container-bg)]/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
               <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
               </svg>
            </div>
            <h3 className="text-lg font-bold truncate pr-4">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-4 md:p-6 bg-gray-50/50 dark:bg-black/20">
           <div className="h-full w-full rounded-2xl bg-white dark:bg-gray-900 shadow-sm border border-[var(--container-border)]">
              <PdfViewer file={file} height="100%" />
           </div>
        </div>

        {/* Footer (Optional) */}
        <div className="px-6 py-3 border-t border-[var(--container-border)] bg-[var(--container-bg)]/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-semibold shadow-lg shadow-indigo-500/20"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
