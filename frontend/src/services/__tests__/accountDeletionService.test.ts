import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestAccountDeletionOtp,
  verifyAndDeleteAccountWithPassword,
  verifyAndDeleteAccountWithOtp,
} from '../accountDeletionService';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

describe('accountDeletionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requestAccountDeletionOtp posts empty body', async () => {
    mockedSendRequest.mockResolvedValue({});
    await requestAccountDeletionOtp();
    expect(mockedSendRequest).toHaveBeenCalledWith('/auth/request-deletion-otp', 'POST', {});
  });

  it('verifyAndDeleteAccountWithPassword passes skipAuthRedirectOn401', async () => {
    mockedSendRequest.mockResolvedValue({});
    await verifyAndDeleteAccountWithPassword('secret');
    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/auth/verify-and-delete',
      'POST',
      { password: 'secret' },
      false,
      { skipAuthRedirectOn401: true },
    );
  });

  it('verifyAndDeleteAccountWithOtp passes otp payload', async () => {
    mockedSendRequest.mockResolvedValue({});
    await verifyAndDeleteAccountWithOtp('123456');
    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/auth/verify-and-delete',
      'POST',
      { otp: '123456' },
      false,
      { skipAuthRedirectOn401: true },
    );
  });
});
