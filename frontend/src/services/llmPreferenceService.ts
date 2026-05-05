import { sendRequest } from '@/utils/api';

export type LlmProviderChoice = 'local' | 'cloud';

export function updateLlmPreference(provider: LlmProviderChoice): Promise<unknown> {
  return sendRequest<unknown>('/files/user/update-llm', 'POST', { provider });
}
