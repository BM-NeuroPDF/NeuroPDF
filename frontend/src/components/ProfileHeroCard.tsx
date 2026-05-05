'use client';

import Image from 'next/image';
import { translations } from '@/utils/translations';

export type ProfileHeroUser = {
  name?: string | null;
  email?: string | null;
};

export type ProfileHeroStats = {
  summary_count: number;
  tools_count: number;
  role: string;
};

export interface ProfileHeroCardProps {
  user: ProfileHeroUser;
  avatarSrc: string | null;
  stats: ProfileHeroStats;
  onSignOut: () => void;
  onEditAvatar: () => void;
  onOpenDocuments: () => void;
  t: (key: keyof (typeof translations)['tr']) => string;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ProfileHeroCard({
  user,
  avatarSrc,
  stats,
  onSignOut,
  onEditAvatar,
  onOpenDocuments,
  t,
}: ProfileHeroCardProps) {
  return (
    <div className="container-card p-6 border border-[var(--navbar-border)] rounded-3xl flex flex-col items-center text-center shadow-lg relative overflow-hidden bg-[var(--container-bg)]">
      <div className="absolute top-0 w-full h-24 bg-gradient-to-b from-[var(--button-bg)] to-transparent opacity-10"></div>
      <div className="relative z-10 w-32 h-32 mb-4 rounded-full border-4 border-[var(--container-bg)] shadow-xl overflow-hidden bg-gray-200 dark:bg-gray-800 flex items-center justify-center group">
        <button
          type="button"
          onClick={onEditAvatar}
          className="absolute top-1 right-1 p-2 bg-[var(--button-bg)] text-white rounded-full shadow-lg hover:brightness-110 transition-all z-20 hover:scale-110"
          title={t('changeProfileImage') || 'Profil Resmini Değiştir'}
          aria-label={t('profileEditAvatarAria')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
            />
          </svg>
        </button>

        {avatarSrc ? (
          <Image
            src={avatarSrc}
            alt={t('profileImageAlt')}
            fill
            sizes="8rem"
            className="object-cover"
            unoptimized={avatarSrc.startsWith('blob:') || avatarSrc.startsWith('data:')}
          />
        ) : (
          <span className="text-4xl font-bold text-[var(--button-bg)]">
            {getInitials(user.name || t('defaultUser') || 'Kullanıcı')}
          </span>
        )}
      </div>
      <h2 className="text-xl font-bold truncate w-full px-2" title={user.name || ''}>
        {user.name}
      </h2>
      <p
        className="text-sm opacity-60 font-medium truncate w-full mb-6 px-2"
        title={user.email || ''}
      >
        {user.email}
      </p>
      <p className="text-sm font-semibold opacity-80 mb-3 tabular-nums">
        {stats.tools_count}{' '}
        <span className="text-xs font-normal opacity-70">{t('documentCountLabel')}</span>
      </p>
      <button
        type="button"
        onClick={onOpenDocuments}
        className="w-full mb-3 py-2 px-4 rounded-xl border border-[var(--navbar-border)] bg-[var(--background)] text-[var(--foreground)] font-semibold hover:brightness-110 transition-colors"
      >
        {t('navDocuments') || 'Belgelerim'}
      </button>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full py-2 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors dark:bg-red-900/10 dark:border-red-900 dark:text-red-400"
      >
        {t('signOut') || 'Çıkış Yap'}
      </button>
    </div>
  );
}
