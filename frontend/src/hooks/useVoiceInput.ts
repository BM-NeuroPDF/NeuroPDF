import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionInstance,
  SpeechRecognitionResultEvent,
  WindowWithSpeechRecognition,
} from '@/types/speechRecognition';

type UseVoiceInputParams<K extends string> = {
  language: string;
  t: (key: K) => string;
  setInput: Dispatch<SetStateAction<string>>;
};

export function useVoiceInput<K extends string>({
  language,
  t,
  setInput,
}: UseVoiceInputParams<K>) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isManuallyStopped = useRef(false);
  const committedTranscriptRef = useRef('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const w = window as WindowWithSpeechRecognition;
    const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
      w.SpeechRecognition ?? w.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) return;

    const recog = new SpeechRecognitionCtor();
    const currentLang = language === 'tr' ? 'tr-TR' : 'en-US';
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = currentLang || 'tr-TR';

    recog.onresult = (event: SpeechRecognitionResultEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const prefix = committedTranscriptRef.current
        ? `${committedTranscriptRef.current} `
        : '';
      const merged = `${prefix}${finalTranscript}${interimTranscript}`.trim();

      if (merged) {
        setInput(merged);
      }
    };

    recog.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') return;

      const errorMsg =
        event.error === 'no-speech'
          ? t('toastMicErrorNoSpeech' as K)
          : event.error === 'not-allowed'
            ? t('toastMicErrorNotAllowed' as K)
            : event.error === 'network'
              ? t('toastMicErrorNetwork' as K)
              : `Hata: ${event.error}`;
      toast.error(errorMsg);
      setIsRecording(false);
    };

    recog.onend = () => {
      if (!isManuallyStopped.current) {
        try {
          recognitionRef.current?.start();
          return;
        } catch {
          // fall through and mark as stopped
        }
      }
      setIsRecording(false);
    };

    recognitionRef.current = recog;

    return () => {
      try {
        if (recognitionRef.current) {
          isManuallyStopped.current = true;
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        }
      } catch {
        // ignore cleanup failures
      }
    };
  }, [language, setInput, t]);

  const ensureMicrophoneAccess = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Tarayıcınız mikrofon erişimini desteklemiyor.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      const err = error as DOMException;
      if (err?.name === 'NotAllowedError') {
        alert(
          'Mikrofon izni reddedildi. Lütfen site ayarlarından mikrofona izin verin.'
        );
      } else if (err?.name === 'NotFoundError') {
        alert('Mikrofon bulunamadı. Lütfen bir mikrofon bağlayın.');
      } else {
        alert(
          'Mikrofon başlatılamadı. Lütfen tarayıcı izinlerini kontrol edin.'
        );
      }
      return false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    isManuallyStopped.current = true;
    recognition.stop();
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert('Tarayıcınız ses tanıma özelliğini desteklemiyor.');
      return;
    }

    try {
      const hasPermission = await ensureMicrophoneAccess();
      if (!hasPermission) return;

      isManuallyStopped.current = false;
      committedTranscriptRef.current = '';
      setInput('');

      const currentLang = language === 'tr' ? 'tr-TR' : 'en-US';
      recognition.lang = currentLang;

      isManuallyStopped.current = true;
      recognition.stop();

      setTimeout(() => {
        isManuallyStopped.current = false;
        recognition.lang = language === 'tr' ? 'tr-TR' : 'en-US';

        try {
          recognition.start();
          setIsRecording(true);
        } catch {
          setIsRecording(true);
        }
      }, 150);
    } catch {
      setIsRecording(false);
    }
  }, [ensureMicrophoneAccess, language, setInput]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      return;
    }
    await startRecording();
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
