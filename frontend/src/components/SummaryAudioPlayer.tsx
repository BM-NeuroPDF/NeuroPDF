'use client';

import type { ChangeEvent } from 'react';
import { translations } from '@/utils/translations';

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export interface SummaryAudioPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioLoading: boolean;
  onTogglePlay: () => void;
  onSeek: (e: ChangeEvent<HTMLInputElement>) => void;
  onSkip: (deltaSeconds: number) => void;
  onDownload?: () => void;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function SummaryAudioPlayer({
  isPlaying,
  currentTime,
  duration,
  audioLoading,
  onTogglePlay,
  onSeek,
  onSkip,
  onDownload,
  t,
}: SummaryAudioPlayerProps) {
  const controlsDisabled = audioLoading;

  return (
    <div className="bg-[var(--background)] p-4 rounded-xl border border-[var(--navbar-border)] animate-in fade-in slide-in-from-top-4 duration-500 relative">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-mono opacity-70 w-10 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={onSeek}
          disabled={controlsDisabled}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-[var(--button-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-xs font-mono opacity-70 w-10">{formatTime(duration)}</span>
      </div>
      <div className="flex justify-center items-center gap-6">
        <button
          type="button"
          onClick={() => onSkip(-10)}
          disabled={controlsDisabled}
          aria-label={t('audioRewindAria')}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={controlsDisabled}
          aria-label={t('audioPlayPauseAria')}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-[var(--button-bg)] text-white hover:scale-110 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isPlaying ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25v13.5m-7.5-13.5v13.5"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6 ml-1"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
              />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSkip(10)}
          disabled={controlsDisabled}
          aria-label={t('audioForwardAria')}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {onDownload ? (
        <button
          type="button"
          onClick={onDownload}
          title={t('downloadAudio') || 'Sesi İndir (MP3)'}
          aria-label={t('audioDownloadAria')}
          className="absolute bottom-4 right-4 text-gray-400 hover:text-[var(--button-bg)] hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0 3-3m-3 3h7.5"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
