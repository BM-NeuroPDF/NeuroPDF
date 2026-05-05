'use client';

import { useEffect, useState } from 'react';
import type { Session } from 'next-auth';
import type { KeyedMutator } from 'swr';
import { translations } from '@/utils/translations';
import { updateLlmPreference } from '@/services/llmPreferenceService';

export type LlmChoiceData = { provider?: string };

export interface LlmPreferenceCardProps {
  llmData: LlmChoiceData | undefined;
  mutateLlm: KeyedMutator<LlmChoiceData>;
  session: Session | null;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function LlmPreferenceCard({ llmData, mutateLlm, session, t }: LlmPreferenceCardProps) {
  const [llmChoice, setLlmChoice] = useState<'local' | 'cloud'>('local');
  const [loadingLlm, setLoadingLlm] = useState(false);

  useEffect(() => {
    if (llmData?.provider) {
      setLlmChoice(llmData.provider.toLowerCase() as 'local' | 'cloud');
    }
  }, [llmData?.provider]);

  if (!session?.user) return null;

  const handleLlmSelection = (choice: 'local' | 'cloud') => setLlmChoice(choice);

  const handleSaveLlm = async () => {
    setLoadingLlm(true);
    try {
      await updateLlmPreference(llmChoice);
      void mutateLlm();
    } catch (error) {
      console.error('Hata:', error);
      alert('Hata oluştu.');
    } finally {
      setLoadingLlm(false);
    }
  };

  return (
    <div className="container-card p-6 border border-[var(--navbar-border)] rounded-3xl shadow-lg flex flex-col relative overflow-hidden transition-all bg-[var(--container-bg)]">
      <div
        className={`absolute -top-10 -right-10 w-40 h-40 blur-[60px] opacity-5 pointer-events-none rounded-full transition-colors duration-500 ${llmChoice === 'local' ? 'bg-green-500' : 'bg-blue-500'}`}
      />
      <h3 className="text-lg font-bold mb-5 flex items-center gap-2 relative z-10">
        <div className="p-2 rounded-lg bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
          >
            <path d="M16.5 7.5h-9v9h9v-9z" />
            <path
              fillRule="evenodd"
              d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15a3 3 0 01-3 3h-.75v.75a.75.75 0 01-1.5 0v-.75h-2.25v.75a.75.75 0 01-1.5 0v-.75H9v.75a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75V6.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A1.5 1.5 0 017.5 5.25h9A1.5 1.5 0 0118 6.75v9A1.5 1.5 0 0116.5 17.25h-9A1.5 1.5 0 016 15.75v-9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        {t('aiPreference') || 'AI Model Tercihi'}
      </h3>
      <div className="llm-selection-container">
        <button
          type="button"
          onClick={() => handleLlmSelection('local')}
          className={`llm-selection-button ${llmChoice === 'local' ? 'active' : ''}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm14.25 6a.75.75 0 01-.75.75h-2.25a.75.75 0 01-.75-.75v-2.25a.75.75 0 01.75-.75h2.25a.75.75 0 01.75.75v2.25zM9 7.5A.75.75 0 008.25 8.25v2.25a.75.75 0 00.75.75h2.25a.75.75 0 00.75-.75v-2.25a.75.75 0 00-.75-.75H9z"
              clipRule="evenodd"
            />
          </svg>
          <span className="truncate">Local LLM</span>
        </button>

        <button
          type="button"
          onClick={() => handleLlmSelection('cloud')}
          className={`llm-selection-button ${llmChoice === 'cloud' ? 'active' : ''}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 shrink-0"
          >
            <path d="M4.5 9.75a6 6 0 0111.573-2.226 3.75 3.75 0 014.133 4.303A4.5 4.5 0 0118 20.25H6.75a5.25 5.25 0 01-2.25-10.5z" />
          </svg>
          <span className="truncate">Cloud LLM</span>
        </button>
      </div>
      <div className="relative z-10 mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h4 className="text-[11px] font-black uppercase tracking-widest opacity-50">
            {llmChoice === 'local'
              ? t('localFeatures') || 'YEREL ÖZELLİKLER'
              : t('cloudFeatures') || 'BULUT ÖZELLİKLERİ'}
          </h4>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${llmChoice === 'local' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400'}`}
          >
            {llmChoice === 'local' ? 'Offline' : 'Online'}
          </span>
        </div>
        <div
          className={`p-4 rounded-2xl border transition-all duration-300 ${llmChoice === 'local' ? 'bg-green-50/30 border-green-100 dark:bg-green-900/10 dark:border-green-900/30' : 'bg-blue-50/30 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30'}`}
        >
          <ul className="space-y-3">
            {llmChoice === 'local' ? (
              <>
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="opacity-80 leading-snug">
                    {t('localFeat1') || 'Maksimum Gizlilik (Veriler cihazda kalır).'}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="opacity-80 leading-snug">
                    {t('localFeat2') || 'İnternet bağlantısı gerektirmez.'}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  <span className="opacity-80 leading-snug">
                    {t('localFeat3') || 'Hız donanımınıza bağlıdır.'}
                  </span>
                </li>
              </>
            ) : (
              <>
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="opacity-80 leading-snug">
                    {t('cloudFeat1') || 'En Yüksek Doğruluk (Gemini 1.5).'}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="opacity-80 leading-snug">
                    {t('cloudFeat2') || 'Geniş bağlam ve karmaşık analiz.'}
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                  <span className="opacity-80 leading-snug">
                    {t('cloudFeat3') || 'Veriler işlenmek üzere gönderilir.'}
                  </span>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
      <div className="mt-auto pt-2 flex justify-center">
        <button
          type="button"
          onClick={() => void handleSaveLlm()}
          disabled={loadingLlm}
          className="w-full py-3 px-4 rounded-xl bg-[var(--button-bg)] text-[var(--button-text)] font-semibold shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loadingLlm ? (
            <>{t('saving') || 'Kaydediliyor...'}</>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path
                  fillRule="evenodd"
                  d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z"
                  clipRule="evenodd"
                />
              </svg>
              {t('savePreference') || 'Tercihi Kaydet'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
