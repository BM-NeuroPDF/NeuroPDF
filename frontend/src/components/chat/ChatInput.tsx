'use client';

import { motion } from 'framer-motion';
import type { FormEvent, RefObject } from 'react';
import type { TranslateFn } from '@/utils/translations';
import type { ProChatPromptSuggestion } from './proChatTypes';

type ChatInputProps = {
  input: string;
  setInput: (v: string) => void;
  onSend: (messageOverride?: string) => void | Promise<void>;
  onStopGeneration?: () => void;
  loading: boolean;
  initializing: boolean;
  isRecording: boolean;
  onVoiceToggle?: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  activePlaceholder: string;
  activeDisclaimer: string;
  promptSuggestions: ProChatPromptSuggestion[];
  promptSuggestionsDisabled: boolean;
  t: TranslateFn;
};

export function ChatInput({
  input,
  setInput,
  onSend,
  onStopGeneration,
  loading,
  initializing,
  isRecording,
  onVoiceToggle,
  fileInputRef,
  inputRef,
  activePlaceholder,
  activeDisclaimer,
  promptSuggestions,
  promptSuggestionsDisabled,
  t,
}: ChatInputProps) {
  return (
    <div
      className="p-4 relative z-10"
      style={{
        backgroundColor: 'var(--navbar-bg)',
        borderTop: '1px solid var(--navbar-border)',
      }}
    >
      {promptSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 px-2">
          {promptSuggestions.map((s, i) => (
            <motion.button
              key={`${s.text}-${i}`}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
              disabled={promptSuggestionsDisabled}
              onClick={() => {
                void onSend(s.text);
              }}
              className="bg-blue-50/80 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900/50 rounded-full px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
            >
              <span className="select-none" aria-hidden>
                {s.icon}
              </span>
              <span>{s.text}</span>
            </motion.button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void onSend();
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1 group/input">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? t('chatListening') : activePlaceholder}
            disabled={loading || initializing}
            className={`chat-input-field w-full pr-24 ${isRecording ? 'ring-2 ring-red-500/50' : ''}`}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={onVoiceToggle}
              disabled={loading || initializing}
              className={`p-2.5 rounded-xl transition-all flex items-center justify-center relative ${
                isRecording
                  ? 'text-red-500 bg-red-50 dark:bg-red-900/20 opacity-100'
                  : 'text-[var(--foreground)] opacity-40 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              aria-label={t('chatVoiceAria')}
              aria-describedby="chat-voice-tooltip"
              title={t('chatVoiceInput')}
            >
              {isRecording && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 rounded-xl bg-red-500/30"
                />
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || initializing}
              className="p-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all text-[var(--foreground)] opacity-40 hover:opacity-100 flex items-center justify-center"
              aria-label={t('chatPdfAria')}
              aria-describedby="chat-attach-tooltip"
              title={t('chatAttachPdf')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          type="submit"
          disabled={!input.trim() || loading || initializing}
          className="btn-primary p-3 rounded-xl flex-shrink-0"
          data-testid="chat-send-button"
          aria-label={t('chatSendAria')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m5 12 7-7 7 7" />
            <path d="M12 19V5" />
          </svg>
        </motion.button>
        {loading && onStopGeneration && (
          <button
            type="button"
            onClick={onStopGeneration}
            className="px-3 py-2 rounded-xl border border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Stop
          </button>
        )}
      </form>
      <span id="chat-voice-tooltip" className="sr-only">
        {t('chatVoiceInput')}
      </span>
      <span id="chat-attach-tooltip" className="sr-only">
        {t('chatAttachPdf')}
      </span>

      <p className="text-[10px] text-center mt-3 opacity-40 leading-tight">{activeDisclaimer}</p>
    </div>
  );
}
