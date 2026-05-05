import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { sendRequest } from '@/utils/api';

export interface UseSummaryAudioOptions {
  summary: string;
  onClearError?: () => void;
  onTtsError?: () => void;
}

export interface UseSummaryAudioReturn {
  audioUrl: string | null;
  audioBlob: Blob | null;
  isPlaying: boolean;
  audioLoading: boolean;
  currentTime: number;
  duration: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  requestAudio: () => Promise<void>;
  togglePlay: () => void;
  seek: (e: ChangeEvent<HTMLInputElement>) => void;
  downloadAudio: () => void;
  /** Clears playback state and cached TTS blob/URL (e.g. new file or new summarize). */
  resetAudio: () => void;
  /** Seek relative to current playback position in seconds. */
  skipBy: (deltaSeconds: number) => void;
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
  onPause: () => void;
  onPlay: () => void;
}

export function useSummaryAudio({
  summary,
  onClearError,
  onTtsError,
}: UseSummaryAudioOptions): UseSummaryAudioReturn {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onClearErrorRef = useRef(onClearError);
  const onTtsErrorRef = useRef(onTtsError);

  useEffect(() => {
    onClearErrorRef.current = onClearError;
    onTtsErrorRef.current = onTtsError;
  }, [onClearError, onTtsError]);

  useEffect(() => {
    return () => {
      if (!audioUrl) return;
      const revoke = window.URL?.revokeObjectURL;
      if (typeof revoke === 'function') revoke(audioUrl);
    };
  }, [audioUrl]);

  const resetAudio = useCallback(() => {
    setAudioUrl(null);
    setAudioBlob(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, []);

  const requestAudio = useCallback(async () => {
    if (!summary) return;
    if (audioUrl) {
      togglePlay();
      return;
    }
    setAudioLoading(true);
    onClearErrorRef.current?.();
    try {
      const resultBlob = await sendRequest<Blob>('/files/listen-summary', 'POST', {
        text: summary,
      });
      if (!(resultBlob instanceof Blob)) throw new Error('Ses verisi alınamadı.');

      setAudioBlob(resultBlob);
      const objectUrl = window.URL.createObjectURL(resultBlob);
      setAudioUrl(objectUrl);
    } catch {
      onTtsErrorRef.current?.();
    } finally {
      setAudioLoading(false);
    }
  }, [summary, audioUrl, togglePlay]);

  const downloadAudio = useCallback(() => {
    if (!audioBlob) return;
    const url = window.URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ozet-seslendirme.mp3';
    document.body.appendChild(a);
    a.click();
    const revoke = window.URL?.revokeObjectURL;
    if (typeof revoke === 'function') revoke(url);
    document.body.removeChild(a);
  }, [audioBlob]);

  const seek = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const skipBy = useCallback((deltaSeconds: number) => {
    if (audioRef.current) audioRef.current.currentTime += deltaSeconds;
  }, []);

  const onTimeUpdate = useCallback(() => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  }, []);

  const onLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, []);

  const onEnded = useCallback(() => setIsPlaying(false), []);
  const onPause = useCallback(() => setIsPlaying(false), []);
  const onPlay = useCallback(() => setIsPlaying(true), []);

  return {
    audioUrl,
    audioBlob,
    isPlaying,
    audioLoading,
    currentTime,
    duration,
    audioRef,
    requestAudio,
    togglePlay,
    seek,
    downloadAudio,
    resetAudio,
    skipBy,
    onTimeUpdate,
    onLoadedMetadata,
    onEnded,
    onPause,
    onPlay,
  };
}
