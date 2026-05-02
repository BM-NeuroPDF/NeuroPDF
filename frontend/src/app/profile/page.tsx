'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '@/context/LanguageContext';
import { swrFetcher } from '@/utils/api';
import { usePdf } from '@/context/PdfContext';
import { useProfileAvatar } from '@/hooks/useProfileAvatar';
import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import {
  LlmPreferenceCard,
  type LlmChoiceData,
} from '@/components/LlmPreferenceCard';
import { ProfileHeroCard } from '@/components/ProfileHeroCard';
import { ProfileStatsCards } from '@/components/ProfileStatsCards';
import { AccountSettingsSection } from '@/components/AccountSettingsSection';
import { ProfileAvatarModal } from '@/components/ProfileAvatarModal';

// Session user tipini genişletelim (id'ye erişim için)
interface ExtendedUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const user = session?.user as ExtendedUser | undefined;
  const router = useRouter();
  const { t } = useLanguage();
  const { savePdf } = usePdf();

  const [mounted, setMounted] = useState(false);

  const { avatarSrc, fetchUserAvatar } = useProfileAvatar({
    status,
    user,
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  useEffect(() => {
    savePdf(null);
  }, [savePdf]);

  useEffect(() => {
    setMounted(true);
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const { data: statsData } = useSWR<{
    summary_count: number;
    tools_count: number;
    role: string;
  }>(status === 'authenticated' ? '/files/user/stats' : null, swrFetcher);

  const { data: llmData, mutate: mutateLlm } = useSWR<LlmChoiceData>(
    status === 'authenticated' ? '/files/user/llm-choice' : null,
    swrFetcher
  );

  const handleRequestDelete = () => setShowConfirmModal(true);

  if (!mounted || status === 'loading') {
    return (
      <div className="min-h-screen p-6 max-w-4xl mx-auto flex flex-col gap-6 pt-24">
        <div className="h-48 w-full bg-[var(--container-bg)] animate-pulse rounded-3xl border border-[var(--navbar-border)]"></div>
      </div>
    );
  }

  if (!session?.user) return null;

  const stats = statsData ?? {
    summary_count: 0,
    tools_count: 0,
    role: 'Standart',
  };

  const userPlan = stats.role || t('standardAccount') || 'Standart Hesap';

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto font-bold text-[var(--foreground)] pt-24 relative">
      <DeleteAccountModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        session={session ?? null}
        t={t}
      />

      <ProfileAvatarModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        onAvatarConfirmed={fetchUserAvatar}
        session={session ?? null}
        t={t}
      />

      {/* --- SAYFA İÇERİĞİ --- */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl tracking-tight">
          {t('profileTitle') || 'Profilim'}
        </h1>
        <button
          onClick={() => router.back()}
          className="text-sm font-medium opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
        >
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
              d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 016 6v3"
            />
          </svg>
          {t('goBack') || 'Geri Dön'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* SOL KOLON */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <ProfileHeroCard
            user={session.user}
            avatarSrc={avatarSrc}
            stats={stats}
            onSignOut={() => void signOut({ callbackUrl: '/' })}
            onEditAvatar={() => setShowImageModal(true)}
            onOpenDocuments={() => router.push('/documents')}
            t={t}
          />

          <LlmPreferenceCard
            llmData={llmData}
            mutateLlm={mutateLlm}
            session={session ?? null}
            t={t}
          />
        </div>

        {/* SAĞ KOLON */}
        <div className="md:col-span-2 space-y-6">
          <ProfileStatsCards stats={stats} userPlan={userPlan} t={t} />

          <AccountSettingsSection onRequestDelete={handleRequestDelete} t={t} />
        </div>
      </div>
    </main>
  );
}
