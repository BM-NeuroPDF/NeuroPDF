/**
 * Minimal DOM Speech Recognition types (vendor-prefixed; not in all TS lib targets).
 */
export type SpeechRecognitionResultEntry = { transcript: string };

export type SpeechRecognitionResultListItem = {
  0: SpeechRecognitionResultEntry;
  isFinal: boolean;
};

export type SpeechRecognitionResultEvent = {
  results: ArrayLike<SpeechRecognitionResultListItem>;
};

export type SpeechRecognitionErrorEvent = {
  error: string;
};

export type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};
