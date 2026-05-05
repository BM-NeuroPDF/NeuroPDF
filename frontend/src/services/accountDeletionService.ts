import { sendRequest } from '@/utils/api';

export function requestAccountDeletionOtp(): Promise<unknown> {
  return sendRequest<unknown>('/auth/request-deletion-otp', 'POST', {});
}

export function verifyAndDeleteAccountWithPassword(password: string): Promise<unknown> {
  return sendRequest<unknown>('/auth/verify-and-delete', 'POST', { password }, false, {
    skipAuthRedirectOn401: true,
  });
}

export function verifyAndDeleteAccountWithOtp(otp: string): Promise<unknown> {
  return sendRequest<unknown>('/auth/verify-and-delete', 'POST', { otp }, false, {
    skipAuthRedirectOn401: true,
  });
}
