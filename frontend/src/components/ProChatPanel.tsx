import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import NeuroLogoIcon from '@/assets/icons/NeuroPDF-Chat.svg';
import { MAX_USER_MB, mbToBytes } from '@/app/config/fileLimits';
import { usePopup } from '@/context/PopupContext';
import { useLanguage } from '@/context/LanguageContext';
import { usePdf } from '@/context/PdfContext';

export type ProChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
};

export type ProChatPromptSuggestion = {
  text: string;
  icon: string;
};

export type ProChatPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  messages: ProChatMessage[];
  onSend: (messageOverride?: string) => void | Promise<void>;
  onFileUpload: (file: File) => void;
  loading: boolean;
  initializing: boolean;
  input: string;
  setInput: (value: string) => void;
  headerTitle: string;
  headerSubtitle?: string;
  avatarSrc: string | null;
  userName?: string;
  placeholder?: string;
  disclaimer?: string;
  initializingLabel?: string;
  typingLabel?: string;
  isRecording?: boolean;
  onVoiceToggle?: () => void;
  /** PDF’e göre dinamik hazır komut çipleri (üst bileşenden). */
  promptSuggestions?: ProChatPromptSuggestion[];
  /** true iken çipler tıklanamaz (oturum yok / yükleniyor). */
  promptSuggestionsDisabled?: boolean;
};

function getInitials(name: string) {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ProChatPanel({
  isOpen,
  onClose,
  messages,
  onSend,
  onFileUpload,
  loading,
  initializing,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const panelJustOpenedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { showError } = usePopup();
  const { t } = useLanguage();
  const { pdfFile } = usePdf();
  const [isDragging, setIsDragging] = useState(false);

  // Default localized values if not provided via props
  const activePlaceholder = placeholder || t('chatPlaceholder');
  const activeDisclaimer = disclaimer || t('chatDisclaimer');
  const activeInitializingLabel = initializingLabel || t('chatInitializing');
  const activeTypingLabel = typingLabel || t('aiTyping');

  // Sesli kayıt sırasında veya metin girişi yapıldığında input alanını en sağa kaydır (imleci sona taşı)
  useEffect(() => {
    if (isRecording && inputRef.current) {
      const el = inputRef.current;
      // Metin girişi sonrası scroll behavior - modern tarayıcılar için
      el.scrollLeft = el.scrollWidth;
      // İmleci sona sabitle
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [input, isRecording]);

  useEffect(() => {
    if (isOpen) {
      panelJustOpenedRef.current = true;
    } else {
      prevMessageCountRef.current = 0;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const count = messages.length;
    const prev = prevMessageCountRef.current;
    const added = count - prev;

    let behavior: ScrollBehavior = 'smooth';
    if (panelJustOpenedRef.current) {
      behavior = 'auto';
      panelJustOpenedRef.current = false;
    } else if (added > 1) {
      // Geçmiş sohbet geri yükleme veya çoklu mesaj tek seferde
      behavior = 'auto';
    }

    prevMessageCountRef.current = count;

    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, loading, isOpen]);

  const validateAndUpload = (file: File) => {
    if (file.type !== 'application/pdf') {
      showError(t('errorOnlyPdf') || 'Sadece PDF dosyaları yüklenebilir.');
      return;
    }
    if (file.size > mbToBytes(MAX_USER_MB)) {
      showError(
        (t('errorFileTooLarge') || 'Dosya çok büyük (Maks {size}MB).').replace(
          '{size}',
          MAX_USER_MB.toString()
        )
      );
      return;
    }
    onFileUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // 1. Sağ Panelden (Aktif PDF) drop kontrolü
    const isPanel = e.dataTransfer.getData('application/x-neuro-pdf');
    if (isPanel && pdfFile) {
      validateAndUpload(pdfFile);
      return;
    }

    // 2. Masaüstünden dosya drop kontrolü
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndUpload(file);
  };

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

            {/* Drag Overlay */}
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
                    <p className="font-bold text-indigo-600 dark:text-indigo-400">
                      {t('chatDropActive')}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div
              className="flex items-center justify-between px-8 py-5 border-b relative z-10"
              style={{
                backgroundColor: 'var(--navbar-bg)',
                borderColor: 'var(--navbar-border)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden text-black">
                    <Image
                      src={NeuroLogoIcon}
                      alt="AI Logo"
                      width={28}
                      height={28}
                    />
                  </div>
                  <span
                    className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 rounded-full"
                    style={{ borderColor: 'var(--navbar-bg)' }}
                  />
                </div>
                <div>
                  <h3
                    className="font-bold leading-tight"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {headerTitle}
                  </h3>
                  {headerSubtitle && (
                    <p className="text-xs opacity-60 truncate max-w-[180px]">
                      {headerSubtitle}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                data-testid="chat-panel-close"
                aria-label="Close"
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
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="chat-messages-area relative flex-1 overflow-y-auto p-6 scrollbar-thin">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
                <Image
                  src={NeuroLogoIcon}
                  alt="Watermark"
                  width={250}
                  height={250}
                />
              </div>

              <div className="space-y-6 relative z-10 font-medium">
                {initializing && (
                  <div className="flex flex-col items-center justify-center h-full py-20 opacity-50">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: 'linear',
                      }}
                      className="w-8 h-8 border-2 border-[var(--button-bg)] border-t-transparent rounded-full"
                    />
                    <p className="text-sm mt-4 font-bold">
                      {activeInitializingLabel}
                    </p>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={msg.id ?? `msg-${idx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`flex max-w-[90%] gap-3 ${
                          msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden text-[10px] font-bold text-black">
                          {msg.role === 'user' ? (
                            avatarSrc ? (
                              <Image
                                src={avatarSrc}
                                alt="avatar"
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            ) : (
                              <span className="text-gray-600">
                                {getInitials(userName)}
                              </span>
                            )
                          ) : (
                            <Image
                              src={NeuroLogoIcon}
                              alt="AI"
                              width={18}
                              height={18}
                            />
                          )}
                        </div>

                        <div
                          className={`chat-bubble ${
                            msg.role === 'user'
                              ? 'chat-bubble-user'
                              : 'chat-bubble-ai'
                          }`}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {loading && (
                  <div className="flex items-center gap-2 text-xs opacity-50 animate-pulse font-bold">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center bg-white border border-gray-100 shadow-sm overflow-hidden">
                      <Image
                        src={NeuroLogoIcon}
                        alt="AI"
                        width={12}
                        height={12}
                      />
                    </div>
                    {activeTypingLabel}
                  </div>
                )}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
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

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="hidden"
              />

              <form
                onSubmit={(e) => {
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
                    placeholder={
                      isRecording ? t('chatListening') : activePlaceholder
                    }
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
                  aria-label="Send"
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
              </form>

              <p className="text-[10px] text-center mt-3 opacity-40 leading-tight">
                {activeDisclaimer}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
