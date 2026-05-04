import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import type { Session } from 'next-auth';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteAccountModal } from '../DeleteAccountModal';
import { sendRequest } from '@/utils/api';
import { signOut } from 'next-auth/react';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);
const mockedSignOut = vi.mocked(signOut);

const t = (k: string) => k;

const baseSession = {
  user: { name: 'Test', email: 't@t.com' },
  expires: '1',
} as Session;

function setup(
  overrides: Partial<ComponentProps<typeof DeleteAccountModal>> = {}
) {
  const onClose = vi.fn();
  const props = {
    isOpen: true,
    onClose,
    session: baseSession,
    t: t as ComponentProps<typeof DeleteAccountModal>['t'],
    ...overrides,
  };
  render(<DeleteAccountModal {...props} />);
  return { onClose, props };
}

describe('DeleteAccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <DeleteAccountModal
        isOpen={false}
        onClose={vi.fn()}
        session={baseSession}
        t={t as ComponentProps<typeof DeleteAccountModal>['t']}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onClose when cancel clicked', async () => {
    mockedSendRequest.mockResolvedValue({ provider: 'local' });
    const { onClose } = setup();
    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith('/auth/me', 'GET');
    });
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('local: verify-and-delete with password after acknowledge', async () => {
    mockedSendRequest.mockImplementation(
      async (endpoint, method, body, _f, opts) => {
        if (endpoint === '/auth/me' && method === 'GET') {
          return { provider: 'local' };
        }
        if (endpoint === '/auth/verify-and-delete' && method === 'POST') {
          expect(body).toEqual({ password: 'correct-password' });
          expect(opts).toEqual({ skipAuthRedirectOn401: true });
          return { message: 'Deleted' };
        }
        throw new Error(`unexpected ${endpoint} ${method}`);
      }
    );
    mockedSignOut.mockResolvedValue(undefined);
    const { onClose } = setup();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('deleteAccountPasswordPlaceholder'),
      { target: { value: 'correct-password' } }
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/auth/verify-and-delete',
        'POST',
        { password: 'correct-password' },
        false,
        { skipAuthRedirectOn401: true }
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockedSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('local: delete stays disabled until password is entered', async () => {
    mockedSendRequest.mockResolvedValue({ provider: 'local' });
    setup();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('confirmDelete').closest('button')).toBeDisabled();

    expect(
      mockedSendRequest.mock.calls.filter(
        (c) => c[0] === '/auth/verify-and-delete'
      )
    ).toHaveLength(0);
  });

  it('local: shows inline error when acknowledge missing', async () => {
    mockedSendRequest.mockResolvedValue({ provider: 'local' });
    setup();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('deleteAccountPasswordPlaceholder'),
      { target: { value: 'pw' } }
    );
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(
        screen.getByText('deleteAccountAcknowledgeRequired')
      ).toBeInTheDocument();
    });
  });

  it('local: shows API error on verify failure without signing out', async () => {
    mockedSendRequest.mockImplementation(async (endpoint, method) => {
      if (endpoint === '/auth/me' && method === 'GET') {
        return { provider: 'local' };
      }
      if (endpoint === '/auth/verify-and-delete' && method === 'POST') {
        throw new Error('Invalid password');
      }
      throw new Error('unexpected');
    });
    setup();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('deleteAccountPasswordPlaceholder'),
      { target: { value: 'pw' } }
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(screen.getByText('Invalid password')).toBeInTheDocument();
    });
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('oauth: request OTP then verify-and-delete', async () => {
    mockedSendRequest.mockImplementation(
      async (endpoint, method, body, _f, opts) => {
        if (endpoint === '/auth/me' && method === 'GET') {
          return { provider: 'google' };
        }
        if (endpoint === '/auth/request-deletion-otp' && method === 'POST') {
          return { message: 'OTP sent' };
        }
        if (endpoint === '/auth/verify-and-delete' && method === 'POST') {
          expect(body).toEqual({ otp: '888777' });
          expect(opts).toEqual({ skipAuthRedirectOn401: true });
          return { message: 'Deleted' };
        }
        throw new Error(`unexpected ${endpoint}`);
      }
    );
    mockedSignOut.mockResolvedValue(undefined);
    const { onClose } = setup();

    await waitFor(() => {
      expect(screen.getByText('deleteAccountSendCode')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('deleteAccountSendCode'));

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/auth/request-deletion-otp',
        'POST',
        {}
      );
    });

    fireEvent.change(
      screen.getByPlaceholderText('deleteAccountOtpPlaceholder'),
      {
        target: { value: '888777' },
      }
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/auth/verify-and-delete',
        'POST',
        { otp: '888777' },
        false,
        { skipAuthRedirectOn401: true }
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockedSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('oauth: shows error when request-deletion-otp fails', async () => {
    mockedSendRequest.mockImplementation(async (endpoint, method) => {
      if (endpoint === '/auth/me' && method === 'GET') {
        return { provider: 'google' };
      }
      if (endpoint === '/auth/request-deletion-otp' && method === 'POST') {
        throw new Error('Password required for local accounts');
      }
      throw new Error('unexpected');
    });
    setup();

    await waitFor(() => {
      expect(screen.getByText('deleteAccountSendCode')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('deleteAccountSendCode'));

    await waitFor(() => {
      expect(
        screen.getByText('Password required for local accounts')
      ).toBeInTheDocument();
    });
  });

  it('does not call verify when session has no user', async () => {
    mockedSendRequest.mockResolvedValue({ provider: 'local' });
    setup({ session: null });

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith('/auth/me', 'GET');
    });
    fireEvent.click(screen.getByText('confirmDelete'));
    expect(
      mockedSendRequest.mock.calls.filter(
        (c) => c[0] === '/auth/verify-and-delete'
      )
    ).toHaveLength(0);
  });

  it('shows provider load error from /auth/me', async () => {
    mockedSendRequest.mockRejectedValue(new Error('network down'));
    setup();

    await waitFor(() => {
      expect(screen.getByText('network down')).toBeInTheDocument();
    });
  });

  it('uses copy fallbacks when t returns empty', async () => {
    mockedSendRequest.mockResolvedValue({ provider: 'local' });
    const tEmpty = (() => '') as ComponentProps<typeof DeleteAccountModal>['t'];
    render(
      <DeleteAccountModal
        isOpen
        onClose={vi.fn()}
        session={baseSession}
        t={tEmpty}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('Hesabınızı Silmek İstiyor musunuz?')
      ).toBeInTheDocument();
    });
  });
});
