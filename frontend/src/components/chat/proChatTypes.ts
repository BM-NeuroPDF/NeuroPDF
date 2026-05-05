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
  onStopGeneration?: () => void;
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
  promptSuggestions?: ProChatPromptSuggestion[];
  promptSuggestionsDisabled?: boolean;
};
