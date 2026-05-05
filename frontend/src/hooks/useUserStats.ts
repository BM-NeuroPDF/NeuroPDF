'use client';

import useSWR from 'swr';
import type { Session } from 'next-auth';
import { sendRequest } from '@/utils/api';

export type UserStats = {
  role?: string;
  summary_count?: number;
  tools_count?: number;
};

export function useUserStats(session: Session | null, status: string) {
  const isVitest = typeof process !== 'undefined' && !!process.env.VITEST;
  const key = !isVitest && status === 'authenticated' && session ? '/files/user/stats' : null;
  return useSWR<UserStats>(key, (endpoint: string) => sendRequest<UserStats>(endpoint, 'GET'), {
    dedupingInterval: 30_000,
    revalidateOnFocus: false,
  });
}
