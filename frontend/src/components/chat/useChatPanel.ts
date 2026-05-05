import { useRef, useEffect, useState, useCallback, type ChangeEvent, type DragEvent } from 'react';
import { MAX_USER_MB } from '@/app/config/fileLimits';
import { validateChatPanelPdf } from '@/services/chatService';
import type { TranslateFn } from '@/utils/translations';
import type { ProChatPanelProps } from './proChatTypes';

type UseChatPanelArgs = Pick<
  ProChatPanelProps,
  | 'isOpen'
  | 'messages'
  | 'loading'
  | 'input'
  | 'onFileUpload'
  | 'placeholder'
  | 'disclaimer'
  | 'initializingLabel'
  | 'typingLabel'
  | 'isRecording'
> & {
  pdfFile: File | null;
  showError: (msg: string) => void;
  t: TranslateFn;
};

export function useChatPanel({
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
}: UseChatPanelArgs) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const panelJustOpenedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const activePlaceholder = placeholder || t('chatPlaceholder');
  const activeDisclaimer = disclaimer || t('chatDisclaimer');
  const activeInitializingLabel = initializingLabel || t('chatInitializing');
  const activeTypingLabel = typingLabel || t('aiTyping');

  useEffect(() => {
    if (isRecording && inputRef.current) {
      const el = inputRef.current;
      el.scrollLeft = el.scrollWidth;
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
      behavior = 'auto';
    }

    prevMessageCountRef.current = count;

    const id = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, loading, isOpen]);

  const validateAndUpload = useCallback(
    (file: File) => {
      const v = validateChatPanelPdf(file, MAX_USER_MB);
      if (!v.ok) {
        if (v.reason === 'invalid_type') {
          showError(t('errorOnlyPdf') || 'Sadece PDF dosyaları yüklenebilir.');
        } else {
          showError(
            (t('errorFileTooLarge') || 'Dosya çok büyük (Maks {size}MB).').replace(
              '{size}',
              MAX_USER_MB.toString(),
            ),
          );
        }
        return;
      }
      onFileUpload(file);
    },
    [onFileUpload, showError, t],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndUpload(file);
      if (e.target) e.target.value = '';
    },
    [validateAndUpload],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const isPanel = e.dataTransfer.getData('application/x-neuro-pdf');
      if (isPanel && pdfFile) {
        validateAndUpload(pdfFile);
        return;
      }

      const file = e.dataTransfer.files?.[0];
      if (file) validateAndUpload(file);
    },
    [pdfFile, validateAndUpload],
  );

  return {
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
  };
}
