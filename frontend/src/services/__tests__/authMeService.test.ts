import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAuthMe } from '../authMeService';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

describe('authMeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchAuthMe delegates to sendRequest GET /auth/me', async () => {
    const payload = {
      user_id: 'u1',
      provider: 'local',
    };
    mockedSendRequest.mockResolvedValue(payload);

    const result = await fetchAuthMe();

    expect(mockedSendRequest).toHaveBeenCalledWith('/auth/me', 'GET');
    expect(result).toEqual(payload);
  });
});
