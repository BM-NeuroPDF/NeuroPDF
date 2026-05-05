import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateLlmPreference } from '../llmPreferenceService';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

describe('llmPreferenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateLlmPreference posts provider', async () => {
    mockedSendRequest.mockResolvedValue(undefined);
    await updateLlmPreference('cloud');
    expect(mockedSendRequest).toHaveBeenCalledWith('/files/user/update-llm', 'POST', {
      provider: 'cloud',
    });
  });
});
