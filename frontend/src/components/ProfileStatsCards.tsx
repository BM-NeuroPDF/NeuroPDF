'use client';

import { translations } from '@/utils/translations';

export type ProfileStatsData = {
  summary_count: number;
  tools_count: number;
  role: string;
};

export interface ProfileStatsCardsProps {
  stats: ProfileStatsData;
  userPlan: string;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function ProfileStatsCards({
  stats,
  userPlan,
  t,
}: ProfileStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2 p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
        <div className="p-3 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
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
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm opacity-60 font-medium">
            {t('membershipType') || 'Üyelik Tipi'}
          </p>
          <p className="text-lg font-bold">{userPlan}</p>
        </div>
      </div>
      <div className="p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
        <div className="p-3 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
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
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 00-1.423 1.423z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm opacity-60 font-medium">
            {t('aiSummary') || 'AI Özetleme'}
          </p>
          <p className="text-lg font-bold">
            {stats.summary_count} {t('processCount') || 'İşlem'}
          </p>
        </div>
      </div>
      <div className="p-6 rounded-2xl border border-[var(--navbar-border)] shadow-sm bg-[var(--background)] flex items-center gap-4 hover:shadow-md transition-shadow">
        <div className="p-3 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
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
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M16.338 3.011a4 4 0 01-5.645 5.645L2.25 17.25M6.75 2.25h.75v.75h-.75zM12.75 6.75h.75v.75h-.75z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm opacity-60 font-medium">
            {t('pdfTools') || 'PDF Araçları'}
          </p>
          <p className="text-lg font-bold">
            {stats.tools_count} {t('processCount') || 'İşlem'}
          </p>
        </div>
      </div>
    </div>
  );
}
