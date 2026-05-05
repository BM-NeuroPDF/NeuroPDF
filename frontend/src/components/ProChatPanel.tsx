'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePopup } from '@/context/PopupContext';
import { useLanguage } from '@/context/LanguageContext';
import { usePdfData } from '@/context/PdfContext';
import { useChatPanel } from './chat/useChatPanel';
import { ChatAttachmentBar } from './chat/ChatAttachmentBar';
import { ChatPanelHeader } from './chat/ChatPanelHeader';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatInput } from './chat/ChatInput';
import type {
  ProChatMessage,
  ProChatPromptSuggestion,
  ProChatPanelProps,
} from './chat/proChatTypes';

export type { ProChatMessage, ProChatPromptSuggestion, ProChatPanelProps };

function ProChatPanel({
  isOpen,
  onClose,
  messages,
  onSend,
  onFileUpload,
  loading,
  initializing,
  onStopGeneration,
  input,
  setInput,
  headerTitle,
  headerSubtitle,
  avatarSrc,
  userName = 'U',
  placeholder,
  disclaimer,
  initializingLabel,
  typingLabel,
  isRecording = false,
  onVoiceToggle,
  promptSuggestions = [],
  promptSuggestionsDisabled = false,
}: ProChatPanelProps) {
  const { showError } = usePopup();
  const { t } = useLanguage();
  const { pdfFile } = usePdfData();

  const {
    messagesEndRef,
    fileInputRef,
    inputRef,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileChange,
    activePlaceholder,
    activeDisclaimer,
    activeInitializingLabel,
    activeTypingLabel,
  } = useChatPanel({
    isOpen,
    messages,
    loading,
    input,
    onFileUpload,
    placeholder,
    disclaimer,
    initializingLabel,
    typingLabel,
    isRecording,
    pdfFile,
    showError,
    t,
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[110] sm:hidden"
            aria-hidden
          />

          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', stiffness: 260, damping: 25 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`fixed top-[64px] right-2 bottom-2 w-full sm:w-[480px] z-[120] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.11)] overflow-hidden rounded-l-[2rem] rounded-r-lg transition-all ${
              isDragging ? 'ring-2 ring-indigo-500 ring-inset' : ''
            }`}
            style={{
              backgroundColor: 'var(--background)',
              border: '1px solid var(--container-border)',
            }}
          >
            <div className="chat-border-glow" />

            <ChatAttachmentBar
              isDragging={isDragging}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              dropActiveLabel={t('chatDropActive')}
            />

            <ChatPanelHeader
              headerTitle={headerTitle}
              headerSubtitle={headerSubtitle}
              onClose={onClose}
            />

            <ChatMessageList
              messages={messages}
              loading={loading}
              initializing={initializing}
              activeInitializingLabel={activeInitializingLabel}
              activeTypingLabel={activeTypingLabel}
              messagesEndRef={messagesEndRef}
              avatarSrc={avatarSrc}
              userName={userName}
            />

            <ChatInput
              input={input}
              setInput={setInput}
              onSend={onSend}
              onStopGeneration={onStopGeneration}
              loading={loading}
              initializing={initializing}
              isRecording={isRecording}
              onVoiceToggle={onVoiceToggle}
              fileInputRef={fileInputRef}
              inputRef={inputRef}
              activePlaceholder={activePlaceholder}
              activeDisclaimer={activeDisclaimer}
              promptSuggestions={promptSuggestions}
              promptSuggestionsDisabled={promptSuggestionsDisabled}
              t={t}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default memo(ProChatPanel);
