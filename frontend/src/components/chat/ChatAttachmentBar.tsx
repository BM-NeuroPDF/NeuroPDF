'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { RefObject } from 'react';
import type { ChangeEvent } from 'react';

type ChatAttachmentBarProps = {
  isDragging: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  dropActiveLabel: string;
};

export function ChatAttachmentBar({
  isDragging,
  fileInputRef,
  onFileChange,
  dropActiveLabel,
}: ChatAttachmentBarProps) {
  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="application/pdf"
        className="hidden"
      />
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-indigo-600/10 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-2xl border-2 border-indigo-500 flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center animate-bounce">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-8 h-8"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75"
                  />
                </svg>
              </div>
              <p className="font-bold text-indigo-600 dark:text-indigo-400">{dropActiveLabel}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
