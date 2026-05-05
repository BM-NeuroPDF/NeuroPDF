'use client';

import useSWR from 'swr';
import type { AuthMeResponse } from '@/utils/api';
import { fetchAuthMe } from '@/services/authMeService';

/** SWR anahtarı; profil ve hesap silme gibi bileşenler aynı önbelleği paylaşır. */
export const AUTH_ME_SWR_KEY = '/auth/me';

export function useCurrentUser(shouldFetch: boolean) {
  return useSWR<AuthMeResponse>(shouldFetch ? AUTH_ME_SWR_KEY : null, fetchAuthMe);
}
