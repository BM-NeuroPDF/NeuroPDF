import { sendRequest, type AuthMeResponse } from '@/utils/api';

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  return sendRequest<AuthMeResponse>('/auth/me', 'GET');
}
