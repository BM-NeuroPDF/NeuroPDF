'use client';

import { translations } from '@/utils/translations';

export interface AccountSettingsSectionProps {
  onRequestDelete: () => void;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function AccountSettingsSection({ onRequestDelete, t }: AccountSettingsSectionProps) {
  return (
    <div className="container-card p-8 border border-[var(--navbar-border)] rounded-3xl shadow-lg bg-[var(--container-bg)]">
      <h3 className="text-xl font-semibold mb-4">{t('accountSettings') || 'Hesap Ayarları'}</h3>
      <p className="opacity-60 font-normal mb-6">
        {t('accountSettingsHint') ||
          'Şifre değişikliği ve hesap silme işlemleri için sağlayıcınızın (Google) ayarlarını kullanmanız gerekmektedir.'}
      </p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled
          className="btn-primary opacity-50 cursor-not-allowed flex justify-between items-center p-4"
        >
          <span className="font-semibold">{t('changeEmail') || 'E-posta Değiştir'}</span>
          <span className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-bold">
            {t('comingSoon') || 'Yakında'}
          </span>
        </button>
        <button
          type="button"
          disabled
          className="btn-primary opacity-50 cursor-not-allowed flex justify-between items-center p-4"
        >
          <span className="font-semibold">{t('downloadData') || 'Verilerimi İndir'}</span>
          <span className="text-xs bg-black/10 dark:bg-white/10 px-2 py-1 rounded font-bold">
            {t('comingSoon') || 'Yakında'}
          </span>
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          className="btn-primary w-full flex justify-between items-center p-4 mt-2 border hover:scale-[1.01] transition-all bg-[var(--error-bg)] text-[var(--error-text)] border-[var(--error-border)] hover:brightness-110 dark:hover:brightness-125"
        >
          <span className="font-semibold flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            {t('deleteAccount') || 'Hesabımı Sil'}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5 opacity-60"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
