'use client';

import { useCallback } from 'react';
import type { Session } from 'next-auth';
import { guestService } from '@/services/guestService';

type UseGuestGatedActionOptions = {
  session: Session | null | undefined;
  checkLimit: () => Promise<boolean>;
  onError: (error: unknown) => void;
};

export function useGuestGatedAction({ session, checkLimit, onError }: UseGuestGatedActionOptions) {
  const runWithGuestCheck = useCallback(
    async (action: () => Promise<void>) => {
      const canProceed = await checkLimit();
      if (!canProceed) return;

      await action();

      if (!session) {
        try {
          await guestService.incrementUsage();
        } catch (error) {
          onError(error);
        }
      }
    },
    [checkLimit, onError, session],
  );

  return { runWithGuestCheck };
}
