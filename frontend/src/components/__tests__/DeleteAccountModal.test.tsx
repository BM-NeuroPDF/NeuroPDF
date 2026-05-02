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

  it('calls onClose when cancel clicked', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes account and signs out on confirm', async () => {
    mockedSendRequest.mockResolvedValue(undefined);
    mockedSignOut.mockResolvedValue(undefined);
    const { onClose } = setup();

    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/auth/delete-account',
        'DELETE'
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(mockedSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
  });

  it('alerts on delete failure and allows retry', async () => {
    mockedSendRequest.mockRejectedValue(new Error('fail'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    setup();

    fireEvent.click(screen.getByText('confirmDelete'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(mockedSignOut).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('does not call API when session has no user', () => {
    setup({
      session: null,
    });
    fireEvent.click(screen.getByText('confirmDelete'));
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('ignores duplicate confirm while request is in flight', async () => {
    mockedSendRequest.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );
    mockedSignOut.mockResolvedValue(undefined);
    setup();

    const confirmBtn = screen.getByText('confirmDelete');
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledTimes(1);
    });
  });

  it('uses copy fallbacks when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof DeleteAccountModal>['t'];
    setup({ t: tEmpty });
    expect(
      screen.getByText('Hesabınızı Silmek İstiyor musunuz?')
    ).toBeInTheDocument();
    expect(screen.getByText('Bu işlem geri alınamaz.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vazgeç/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sil$/i })).toBeInTheDocument();
  });

  it('uses Turkish fallbacks when t returns empty for errors', async () => {
    mockedSendRequest.mockRejectedValue(new Error('fail'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const tEmpty = (() => '') as ComponentProps<typeof DeleteAccountModal>['t'];

    render(
      <DeleteAccountModal
        isOpen
        onClose={vi.fn()}
        session={baseSession}
        t={tEmpty}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Sil/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Hata oluştu.');
    });
    alertSpy.mockRestore();
  });
});
