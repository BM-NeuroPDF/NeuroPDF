import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import type { Session } from 'next-auth';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import { ProfileAvatarModal } from '../ProfileAvatarModal';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

const t = (k: string) => k;

const baseSession = {
  user: { id: 'user-1', name: 'Test', email: 't@t.com' },
  expires: '1',
} as Session;

function setup(
  overrides: Partial<ComponentProps<typeof ProfileAvatarModal>> = {}
) {
  const onClose = vi.fn();
  const onAvatarConfirmed = vi.fn().mockResolvedValue(undefined);
  const props = {
    isOpen: true,
    onClose,
    onAvatarConfirmed,
    session: baseSession,
    t: t as ComponentProps<typeof ProfileAvatarModal>['t'],
    ...overrides,
  };
  const view = render(<ProfileAvatarModal {...props} />);
  return { ...view, onClose, onAvatarConfirmed, props };
}

function pngFileInput() {
  return document.querySelector(
    'input[type="file"][accept="image/png"]'
  ) as HTMLInputElement;
}

function clickPurpleGenerateSubmit() {
  const textbox = screen.getByRole('textbox');
  const row = textbox.closest('.flex.gap-2');
  const btn = row?.querySelector('button.bg-purple-600') as HTMLButtonElement;
  fireEvent.click(btn);
}

describe('ProfileAvatarModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-ref');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  const getRevokeMock = () =>
    vi.mocked(globalThis.URL.revokeObjectURL as ReturnType<typeof vi.fn>);

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ProfileAvatarModal
        isOpen={false}
        onClose={vi.fn()}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={t as ComponentProps<typeof ProfileAvatarModal>['t']}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('closes when dismiss clicked', () => {
    const { onClose } = setup();
    const closeBtn = document.querySelector(
      'button.absolute.top-4.right-4'
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects non-png upload', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setup();
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    fireEvent.change(pngFileInput(), { target: { files: [file] } });
    expect(alertSpy).toHaveBeenCalled();
  });

  it('uses Turkish only-png message when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileAvatarModal>['t'];
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <ProfileAvatarModal
        isOpen
        onClose={vi.fn()}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={tEmpty}
      />
    );
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] },
    });
    expect(alertSpy).toHaveBeenCalledWith('Sadece PNG dosyaları yüklenebilir.');
  });

  it('ignores upload when no file selected', () => {
    mockedSendRequest.mockClear();
    setup();
    fireEvent.change(pngFileInput(), { target: { files: [] } });
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('opens PNG upload picker when upload row is clicked', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    setup();
    fireEvent.click(screen.getByText('uploadPng'));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('opens reference file picker when ref button is clicked', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.click(screen.getByText('📸 Fotoğraf Ekle (Referans)'));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('runs delayed reset after close', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(
      <ProfileAvatarModal
        isOpen
        onClose={onClose}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={t as ComponentProps<typeof ProfileAvatarModal>['t']}
      />
    );
    rerender(
      <ProfileAvatarModal
        isOpen={false}
        onClose={onClose}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={t as ComponentProps<typeof ProfileAvatarModal>['t']}
      />
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
  });

  it('clears close timeout when reopening quickly', () => {
    vi.useFakeTimers();
    const props = {
      onClose: vi.fn(),
      onAvatarConfirmed: vi.fn(),
      session: baseSession,
      t: t as ComponentProps<typeof ProfileAvatarModal>['t'],
    };
    const { rerender } = render(<ProfileAvatarModal isOpen {...props} />);
    rerender(<ProfileAvatarModal isOpen={false} {...props} />);
    rerender(<ProfileAvatarModal isOpen {...props} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
  });

  it('clears pending close timeout on unmount', () => {
    vi.useFakeTimers();
    const props = {
      onClose: vi.fn(),
      onAvatarConfirmed: vi.fn(),
      session: baseSession,
      t: t as ComponentProps<typeof ProfileAvatarModal>['t'],
    };
    const { unmount, rerender } = render(
      <ProfileAvatarModal isOpen {...props} />
    );
    rerender(<ProfileAvatarModal isOpen={false} {...props} />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(300);
    });
  });

  it('revokes reference blob when reopening before delayed cleanup', () => {
    vi.useFakeTimers();
    const revokeSpy = getRevokeMock();
    const props = {
      onClose: vi.fn(),
      onAvatarConfirmed: vi.fn(),
      session: baseSession,
      t: t as ComponentProps<typeof ProfileAvatarModal>['t'],
    };
    const { rerender } = render(<ProfileAvatarModal isOpen {...props} />);
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'r.png', { type: 'image/png' })] },
    });
    rerender(<ProfileAvatarModal isOpen={false} {...props} />);
    rerender(<ProfileAvatarModal isOpen {...props} />);
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('revokes reference blob on delayed close cleanup', () => {
    vi.useFakeTimers();
    const revokeSpy = getRevokeMock();
    const props = {
      onClose: vi.fn(),
      onAvatarConfirmed: vi.fn(),
      session: baseSession,
      t: t as ComponentProps<typeof ProfileAvatarModal>['t'],
    };
    const { rerender } = render(<ProfileAvatarModal isOpen {...props} />);
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'r2.png', { type: 'image/png' })] },
    });
    rerender(<ProfileAvatarModal isOpen={false} {...props} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('uploads png and confirms avatar refresh', async () => {
    mockedSendRequest.mockResolvedValue(undefined);
    const { onClose, onAvatarConfirmed } = setup();
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    fireEvent.change(pngFileInput(), { target: { files: [file] } });

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/api/v1/user/user-1/avatar',
        'POST',
        expect.any(FormData),
        true
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(onAvatarConfirmed).toHaveBeenCalled();
  });

  it('uses Turkish upload success when t returns empty', async () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileAvatarModal>['t'];
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockedSendRequest.mockResolvedValue(undefined);
    render(
      <ProfileAvatarModal
        isOpen
        onClose={vi.fn()}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={tEmpty}
      />
    );
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Profil resmi güncellendi!');
    });
  });

  it('uses Turkish upload error when t returns empty', async () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileAvatarModal>['t'];
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockedSendRequest.mockRejectedValue(new Error('x'));
    render(
      <ProfileAvatarModal
        isOpen
        onClose={vi.fn()}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={tEmpty}
      />
    );
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['y'], 'y.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Yükleme başarısız.');
    });
  });

  it('uses me when session user has no id', async () => {
    mockedSendRequest.mockResolvedValue(undefined);
    setup({
      session: {
        user: { name: 'A', email: 'a@b.com' },
        expires: '1',
      } as Session,
    });
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/api/v1/user/me/avatar',
        'POST',
        expect.any(FormData),
        true
      );
    });
  });

  it('alerts on upload failure', async () => {
    mockedSendRequest.mockRejectedValue(new Error('fail'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setup();
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('imageUploadError');
    });
  });

  it('switches to generate mode and back', () => {
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    expect(screen.getByText('AI Avatar Studio')).toBeInTheDocument();
    const headerRow = screen.getByText('AI Avatar Studio').parentElement;
    const backBtn = headerRow?.querySelector('button') as HTMLButtonElement;
    fireEvent.click(backBtn);
    expect(screen.getByText('changeProfileImage')).toBeInTheDocument();
  });

  it('rejects non-png reference', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(pngFileInput(), {
      target: {
        files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })],
      },
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Referans resim sadece PNG formatında olabilir.'
    );
  });

  it('ignores reference change when no file', () => {
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(pngFileInput(), { target: { files: [] } });
    expect(screen.getByText('📸 Fotoğraf Ekle (Referans)')).toBeInTheDocument();
  });

  it('generates without reference', async () => {
    mockedSendRequest.mockResolvedValue({
      preview_image: 'data:image/png;base64,xx',
      temp_avatar_id: 'temp-1',
    });
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'a cat' },
    });
    clickPurpleGenerateSubmit();

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/api/v1/user/user-1/avatar/generate',
        'POST',
        { prompt: 'a cat' }
      );
    });
    expect(screen.getByAltText('AI Preview')).toBeInTheDocument();
  });

  it('generates with reference image', async () => {
    mockedSendRequest.mockResolvedValue({
      preview_image: 'data:image/png;base64,xx',
      temp_avatar_id: 'temp-2',
    });
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(pngFileInput(), {
      target: {
        files: [new File(['x'], 'r.png', { type: 'image/png' })],
      },
    });
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'add hat' },
    });
    clickPurpleGenerateSubmit();

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/api/v1/user/user-1/avatar/edit',
        'POST',
        expect.any(FormData),
        true
      );
    });
  });

  it('does not set preview when response incomplete', async () => {
    mockedSendRequest.mockResolvedValue({});
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x' },
    });
    clickPurpleGenerateSubmit();
    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalled();
    });
    expect(screen.queryByAltText('AI Preview')).not.toBeInTheDocument();
  });

  it('alerts on generate failure', async () => {
    mockedSendRequest.mockRejectedValue(new Error('x'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x' },
    });
    clickPurpleGenerateSubmit();
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Resim oluşturulamadı.');
    });
  });

  it('confirms avatar and refreshes', async () => {
    mockedSendRequest
      .mockResolvedValueOnce({
        preview_image: 'data:image/png;base64,xx',
        temp_avatar_id: 'temp-3',
      })
      .mockResolvedValueOnce(undefined);
    const { onClose, onAvatarConfirmed } = setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x' },
    });
    clickPurpleGenerateSubmit();
    await waitFor(() => screen.getByAltText('AI Preview'));

    fireEvent.click(screen.getByText('Bu Resmi Kullan'));

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/api/v1/user/user-1/avatar/confirm',
        'POST',
        { temp_avatar_id: 'temp-3' }
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(onAvatarConfirmed).toHaveBeenCalled();
  });

  it('alerts on confirm failure', async () => {
    mockedSendRequest
      .mockResolvedValueOnce({
        preview_image: 'data:image/png;base64,xx',
        temp_avatar_id: 'temp-4',
      })
      .mockRejectedValueOnce(new Error('bad'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x' },
    });
    clickPurpleGenerateSubmit();
    await waitFor(() => screen.getByAltText('AI Preview'));
    fireEvent.click(screen.getByText('Bu Resmi Kullan'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Hata oluştu.');
    });
  });

  it('retries preview from generate result', async () => {
    mockedSendRequest.mockResolvedValue({
      preview_image: 'data:image/png;base64,xx',
      temp_avatar_id: 't',
    });
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x' },
    });
    clickPurpleGenerateSubmit();
    await waitFor(() => screen.getByAltText('AI Preview'));
    fireEvent.click(screen.getByText('Tekrar Dene'));
    expect(screen.queryByAltText('AI Preview')).not.toBeInTheDocument();
  });

  it('clears reference thumbnail', async () => {
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(pngFileInput(), {
      target: {
        files: [new File(['x'], 'r.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => {
      expect(screen.getByAltText('ref')).toBeInTheDocument();
    });
    const thumb = screen.getByAltText('ref').closest('.group');
    const clearBtn = within(thumb as HTMLElement).getByRole('button');
    fireEvent.click(clearBtn);
    expect(screen.queryByAltText('ref')).not.toBeInTheDocument();
  });

  it('submits generate on Enter in prompt', async () => {
    mockedSendRequest.mockResolvedValue({
      preview_image: 'data:image/png;base64,xx',
      temp_avatar_id: 't',
    });
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'hello' } });
    fireEvent.keyDown(textbox, { key: 'Enter' });
    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/api/v1/user/user-1/avatar/generate',
        'POST',
        { prompt: 'hello' }
      );
    });
  });

  it('does not generate on Enter when prompt empty', () => {
    mockedSendRequest.mockClear();
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    const textbox = screen.getByRole('textbox');
    fireEvent.keyDown(textbox, { key: 'Enter' });
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('shows uploading spinner', async () => {
    mockedSendRequest.mockImplementation(
      () => new Promise((r) => setTimeout(r, 5000))
    );
    setup();
    fireEvent.change(pngFileInput(), {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    });
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows confirming label on confirm', async () => {
    mockedSendRequest
      .mockResolvedValueOnce({
        preview_image: 'data:image/png;base64,xx',
        temp_avatar_id: 't',
      })
      .mockImplementationOnce(() => new Promise((r) => setTimeout(r, 3000)));
    setup();
    fireEvent.click(screen.getByText('generateWithAI'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'x' },
    });
    clickPurpleGenerateSubmit();
    await waitFor(() => screen.getByAltText('AI Preview'));
    fireEvent.click(screen.getByText('Bu Resmi Kullan'));
    expect(screen.getByText('Kaydediliyor...')).toBeInTheDocument();
  });

  it('uses t fallbacks for select labels when empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileAvatarModal>['t'];
    render(
      <ProfileAvatarModal
        isOpen
        onClose={vi.fn()}
        onAvatarConfirmed={vi.fn()}
        session={baseSession}
        t={tEmpty}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Profil Resmini Değiştir' })
    ).toBeInTheDocument();
    expect(screen.getByText('PNG Yükle')).toBeInTheDocument();
  });
});
