import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { sendRequest } from '@/utils/api';

export interface UseProfileAvatarUser {
  id?: string;
  image?: string | null;
}

export interface UseProfileAvatarParams {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: UseProfileAvatarUser | null | undefined;
}

export function useProfileAvatar({ status, user }: UseProfileAvatarParams): {
  avatarSrc: string | null;
  setAvatarSrc: Dispatch<SetStateAction<string | null>>;
  fetchUserAvatar: () => Promise<void>;
} {
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  const fetchUserAvatar = useCallback(async () => {
    if (!user) return;
    const uid = user.id || 'me';
    try {
      const blob = await sendRequest<Blob>(`/api/v1/user/${uid}/avatar`, 'GET');
      setAvatarSrc((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      return;
    } catch (e) {
      console.warn('Avatar getirme hatası:', e);
    }
    setAvatarSrc(user.image ?? null);
  }, [user]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (status === 'authenticated' && userId) void fetchUserAvatar();
  }, [status, userId, fetchUserAvatar]);

  return { avatarSrc, setAvatarSrc, fetchUserAvatar };
}
