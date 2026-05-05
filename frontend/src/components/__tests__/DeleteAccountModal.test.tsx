import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps, ReactElement } from 'react';
import type { Session } from 'next-auth';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { DeleteAccountModal } from '../DeleteAccountModal';
import { fetchAuthMe } from '@/services/authMeService';
import {
  requestAccountDeletionOtp,
  verifyAndDeleteAccountWithPassword,
  verifyAndDeleteAccountWithOtp,
} from '@/services/accountDeletionService';
import { signOut } from 'next-auth/react';

vi.mock('@/services/authMeService', () => ({
  fetchAuthMe: vi.fn(),
}));

vi.mock('@/services/accountDeletionService', () => ({
  requestAccountDeletionOtp: vi.fn(),
  verifyAndDeleteAccountWithPassword: vi.fn(),
  verifyAndDeleteAccountWithOtp: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}));

const mockedFetchAuthMe = vi.mocked(fetchAuthMe);
const mockedRequestOtp = vi.mocked(requestAccountDeletionOtp);
const mockedVerifyPwd = vi.mocked(verifyAndDeleteAccountWithPassword);
const mockedVerifyOtp = vi.mocked(verifyAndDeleteAccountWithOtp);
const mockedSignOut = vi.mocked(signOut);

const t = (k: string) => k;

const baseSession = {
  user: { name: 'Test', email: 't@t.com' },
  expires: '1',
} as Session;

function renderWithFreshSwr(ui: ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
}

function setup(overrides: Partial<ComponentProps<typeof DeleteAccountModal>> = {}) {
  const onClose = vi.fn();
  const props = {
    isOpen: true,
    onClose,
    session: baseSession,
    t: t as ComponentProps<typeof DeleteAccountModal>['t'],
    ...overrides,
  };
  renderWithFreshSwr(<DeleteAccountModal {...props} />);
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
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onClose when cancel clicked', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    const { onClose } = setup();
    await waitFor(() => {
      expect(mockedFetchAuthMe).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('local: verify-and-delete with password after acknowledge', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    mockedVerifyPwd.mockResolvedValue({ message: 'Deleted' });
    mockedSignOut.mockResolvedValue(undefined);
    const { onClose } = setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(mockedVerifyPwd).toHaveBeenCalledWith('correct-password');
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockedSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('local: delete stays disabled until password is entered', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('confirmDelete').closest('button')).toBeDisabled();

    expect(mockedVerifyPwd).not.toHaveBeenCalled();
  });

  it('local: shows inline error when acknowledge missing', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder'), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(screen.getByText('deleteAccountAcknowledgeRequired')).toBeInTheDocument();
    });
  });

  it('local: shows API error on verify failure without signing out', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    mockedVerifyPwd.mockRejectedValue(new Error('Invalid password'));
    setup();

    await waitFor(() => {
      expect(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('deleteAccountPasswordPlaceholder'), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(screen.getByText('Invalid password')).toBeInTheDocument();
    });
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('oauth: request OTP then verify-and-delete', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'google' });
    mockedRequestOtp.mockResolvedValue({ message: 'OTP sent' });
    mockedVerifyOtp.mockResolvedValue({ message: 'Deleted' });
    mockedSignOut.mockResolvedValue(undefined);
    const { onClose } = setup();

    await waitFor(() => {
      expect(screen.getByText('deleteAccountSendCode')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('deleteAccountSendCode'));

    await waitFor(() => {
      expect(mockedRequestOtp).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByPlaceholderText('deleteAccountOtpPlaceholder'), {
      target: { value: '888777' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(mockedVerifyOtp).toHaveBeenCalledWith('888777');
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockedSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('oauth: shows error when request-deletion-otp fails', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'google' });
    mockedRequestOtp.mockRejectedValue(new Error('Password required for local accounts'));
    setup();

    await waitFor(() => {
      expect(screen.getByText('deleteAccountSendCode')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('deleteAccountSendCode'));

    await waitFor(() => {
      expect(screen.getByText('Password required for local accounts')).toBeInTheDocument();
    });
  });

  it('does not call verify when session has no user', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    setup({ session: null });

    await waitFor(() => {
      expect(mockedFetchAuthMe).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByText('confirmDelete'));
    expect(mockedVerifyPwd).not.toHaveBeenCalled();
    expect(mockedVerifyOtp).not.toHaveBeenCalled();
  });

  it('shows provider load error from /auth/me', async () => {
    mockedFetchAuthMe.mockRejectedValue(new Error('network down'));
    setup();

    await waitFor(() => {
      expect(screen.getByText('network down')).toBeInTheDocument();
    });
  });

  it('uses copy fallbacks when t returns empty', async () => {
    mockedFetchAuthMe.mockResolvedValue({ provider: 'local' });
    const tEmpty = (() => '') as ComponentProps<typeof DeleteAccountModal>['t'];
    renderWithFreshSwr(
      <DeleteAccountModal isOpen onClose={vi.fn()} session={baseSession} t={tEmpty} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Hesabınızı Silmek İstiyor musunuz?')).toBeInTheDocument();
    });
  });
});
