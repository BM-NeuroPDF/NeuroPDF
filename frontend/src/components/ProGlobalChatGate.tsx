'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

const ProGlobalChatLazy = dynamic(() => import('@/components/ProGlobalChat'), {
  ssr: false,
  loading: () => (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-[999] h-14 w-14 shrink-0"
      aria-hidden
    />
  ),
});

/**
 * ProGlobalChat ağır bir client ağacıdır; yalnızca giriş yapmış kullanıcılar için
 * ilk etkileşim veya requestIdleCallback sonrası dinamik yüklenir.
 * Misafir: hafif /pricing FAB (eski davranış: tıklanınca pricing).
 */
export function ProGlobalChatGate() {
  const { status } = useSession();
  const { t } = useLanguage();
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      setShouldLoad(false);
      return;
    }

    let done = false;
    let ricId: number | undefined;
    /** `window.setTimeout` DOM imzası (global `setTimeout` Node’da Timeout döndürebilir). */
    let timerId: number | null = null;

    const commit = () => {
      if (done) return;
      done = true;
      setShouldLoad(true);
      window.removeEventListener('pointerdown', onInteract, true);
      window.removeEventListener('keydown', onInteract, true);
      if (typeof ricId === 'number') {
        window.cancelIdleCallback(ricId);
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };

    const onInteract = () => {
      commit();
    };

    window.addEventListener('pointerdown', onInteract, { capture: true });
    window.addEventListener('keydown', onInteract, { capture: true });

    if (typeof window.requestIdleCallback === 'function') {
      ricId = window.requestIdleCallback(() => commit(), { timeout: 4000 });
    } else {
      timerId = window.setTimeout(() => commit(), 2500);
    }

    return () => {
      done = true;
      window.removeEventListener('pointerdown', onInteract, true);
      window.removeEventListener('keydown', onInteract, true);
      if (typeof ricId === 'number') {
        window.cancelIdleCallback(ricId);
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [status]);

  if (status === 'loading') {
    return null;
  }

  if (status === 'unauthenticated') {
    return (
      <Link
        href="/pricing"
        className="fixed bottom-6 right-6 z-[999] flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/90 shadow-md backdrop-blur-sm"
        aria-label={t('navDocuments')}
        data-testid="global-chat-fab"
      />
    );
  }

  if (!shouldLoad) {
    return null;
  }

  return <ProGlobalChatLazy />;
}
