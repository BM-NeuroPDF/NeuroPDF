'use client';

import { translations } from '@/utils/translations';

export interface SummarizeBusyOverlayProps {
  open: boolean;
  audioLoading: boolean;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function SummarizeBusyOverlay({ open, audioLoading, t }: SummarizeBusyOverlayProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all">
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl shadow-2xl border border-[var(--navbar-border)] bg-[var(--container-bg)]">
        <div className="relative w-20 h-20">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-[var(--navbar-border)] rounded-full opacity-30" />
          <div className="absolute top-0 left-0 w-full h-full border-4 border-t-[var(--button-bg)] rounded-full animate-spin" />
        </div>

        <h2 className="mt-6 text-2xl font-bold tracking-tight animate-pulse text-[var(--foreground)]">
          {audioLoading
            ? t('preparingAudio') || 'Ses hazırlanıyor...'
            : t('summarizingStatus') || 'Yapay Zeka Özetliyor...'}
        </h2>

        <p className="mt-2 text-sm font-medium opacity-60 max-w-xs text-center text-[var(--foreground)]">
          {audioLoading
            ? t('waitAudioGen') || 'Bu işlem biraz sürebilir...'
            : t('waitMessage') || 'PDF içeriği analiz ediliyor, lütfen bekleyin...'}
        </p>
      </div>
    </div>
  );
}
