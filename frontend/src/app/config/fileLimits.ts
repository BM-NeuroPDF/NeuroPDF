function readMbEnv(keys: string[], fallback: number): number {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw || raw.trim() === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

// Client-side limitler için hem NEXT_PUBLIC hem de legacy key desteği.
export const MAX_GUEST_MB = readMbEnv(
  ['NEXT_PUBLIC_MAX_FILE_SIZE_GUEST_MB', 'MAX_FILE_SIZE_GUEST_MB'],
  5,
);

export const MAX_USER_MB = readMbEnv(
  ['NEXT_PUBLIC_MAX_FILE_SIZE_USER_MB', 'MAX_FILE_SIZE_USER_MB'],
  50,
);

export const mbToBytes = (mb: number) => Math.floor(mb * 1024 * 1024);

export const getMaxUploadBytes = (isGuest: boolean) =>
  mbToBytes(isGuest ? MAX_GUEST_MB : MAX_USER_MB);

export const getMaxMergeTotalBytes = (isGuest: boolean) => getMaxUploadBytes(isGuest);
