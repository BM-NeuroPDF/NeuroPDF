import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummaryResultPanel } from '../SummaryResultPanel';

vi.mock('@/services/pdfService', () => ({
  pdfService: {
    createPdfFromMarkdown: vi.fn(),
  },
}));

const t = (k: string) => k;

function setup(
  overrides: Partial<ComponentProps<typeof SummaryResultPanel>> = {}
) {
  const onNew = vi.fn();
  const onDownloadPdf = vi.fn();
  const onStartChat = vi.fn();
  const onRequestAudio = vi.fn();
  const props = {
    summary: 'Hello **world**',
    file: new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }),
    userRole: 'standard',
    onNew,
    onDownloadPdf,
    onStartChat,
    onRequestAudio,
    audioUrl: null,
    audioLoading: false,
    audioPlayer: <div data-testid="audio-slot">player</div>,
    t: t as ComponentProps<typeof SummaryResultPanel>['t'],
    ...overrides,
  };
  const view = render(<SummaryResultPanel {...props} />);
  return { ...view, onNew, onDownloadPdf, onStartChat, onRequestAudio, props };
}

describe('SummaryResultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders summary and markdown viewer', () => {
    setup();
    expect(screen.getByText('summaryResultTitle')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /PDF indir/i })
    ).toBeInTheDocument();
  });

  it('sets data-filename from file', () => {
    const { container } = setup();
    const root = container.querySelector('[data-filename="doc.pdf"]');
    expect(root).toBeTruthy();
  });

  it('calls onDownloadPdf and onNew', () => {
    const { onDownloadPdf, onNew } = setup();
    fireEvent.click(screen.getByText('downloadPdf'));
    fireEvent.click(screen.getByText('newProcess'));
    expect(onDownloadPdf).toHaveBeenCalled();
    expect(onNew).toHaveBeenCalled();
  });

  it('calls onRequestAudio when authenticated listen UI', () => {
    const { onRequestAudio } = setup();
    fireEvent.click(screen.getByText('listenSummary'));
    expect(onRequestAudio).toHaveBeenCalled();
  });

  it('shows locked listen when onRequestAudio omitted', () => {
    setup({ onRequestAudio: undefined });
    const btn = screen.getByText('listenSummary').closest('button');
    expect(btn?.disabled).toBe(true);
  });

  it('shows loading label on listen button when audioLoading', () => {
    setup({ audioLoading: true });
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('calls onStartChat and shows upgrade label for non-pro', () => {
    const { onStartChat } = setup({ userRole: 'standard' });
    expect(screen.getByText('upgradeToChat')).toBeInTheDocument();
    fireEvent.click(screen.getByText('upgradeToChat'));
    expect(onStartChat).toHaveBeenCalled();
  });

  it('shows chatButton label for pro user', () => {
    setup({ userRole: 'pro' });
    expect(screen.getByText('chatButton')).toBeInTheDocument();
  });

  it('treats pro user role variant as pro for chat label', () => {
    setup({ userRole: 'pro user' });
    expect(screen.getByText('chatButton')).toBeInTheDocument();
  });

  it('uses fallback chat labels when t returns empty', () => {
    const tFallback = ((k: string) =>
      k === 'chatButton' || k === 'upgradeToChat' ? '' : k) as ComponentProps<
      typeof SummaryResultPanel
    >['t'];
    const { rerender } = render(
      <SummaryResultPanel
        summary="x"
        file={null}
        userRole="pro"
        onNew={vi.fn()}
        onDownloadPdf={vi.fn()}
        onStartChat={vi.fn()}
        onRequestAudio={vi.fn()}
        audioUrl={null}
        audioLoading={false}
        audioPlayer={null}
        t={tFallback}
      />
    );
    expect(screen.getByText('Sohbet Et')).toBeInTheDocument();
    rerender(
      <SummaryResultPanel
        summary="x"
        file={null}
        userRole="standard"
        onNew={vi.fn()}
        onDownloadPdf={vi.fn()}
        onStartChat={vi.fn()}
        onRequestAudio={vi.fn()}
        audioUrl={null}
        audioLoading={false}
        audioPlayer={null}
        t={tFallback}
      />
    );
    expect(screen.getByText("Sohbet için Pro'ya geç")).toBeInTheDocument();
  });

  it('applies filled listen style when audioUrl is set and not loading', () => {
    const { container } = setup({
      audioUrl: 'blob:mock',
      audioLoading: false,
    });
    const listenBtn = screen.getByText('listenSummary').closest('button');
    expect(listenBtn?.className).toContain('bg-[var(--button-bg)]');
    expect(container.querySelector('[data-filename="doc.pdf"]')).toBeTruthy();
  });

  it('applies outline listen style when no audio url and not loading', () => {
    setup({
      audioUrl: null,
      audioLoading: false,
    });
    const listenBtn = screen.getByText('listenSummary').closest('button');
    expect(listenBtn?.className).toContain('border-[var(--navbar-border)]');
  });

  it('uses listen label fallback when t returns empty and not loading', () => {
    const tPartial = ((k: string) =>
      k === 'listenSummary' ? '' : k) as ComponentProps<
      typeof SummaryResultPanel
    >['t'];
    setup({
      t: tPartial,
      audioUrl: null,
      audioLoading: false,
    });
    expect(screen.getByText('Özeti Dinle')).toBeInTheDocument();
  });

  it('uses built-in fallbacks when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof SummaryResultPanel>['t'];
    const { unmount } = render(
      <SummaryResultPanel
        summary="hello"
        file={null}
        userRole={null}
        onNew={vi.fn()}
        onDownloadPdf={vi.fn()}
        onRequestAudio={vi.fn()}
        onStartChat={vi.fn()}
        audioUrl={null}
        audioLoading
        audioPlayer={null}
        t={tEmpty}
      />
    );
    expect(screen.getByText('Özet Sonucu')).toBeInTheDocument();
    expect(screen.getByText('İşlem Başarılı')).toBeInTheDocument();
    expect(screen.getByText('PDF Olarak İndir')).toBeInTheDocument();
    expect(screen.getByText('Hazırlanıyor...')).toBeInTheDocument();
    expect(screen.getByText('Yeni İşlem')).toBeInTheDocument();
    unmount();
    render(
      <SummaryResultPanel
        summary="x"
        file={null}
        userRole={null}
        onNew={vi.fn()}
        onDownloadPdf={vi.fn()}
        onRequestAudio={undefined}
        onStartChat={undefined}
        audioUrl={null}
        audioLoading={false}
        audioPlayer={null}
        t={tEmpty}
      />
    );
    expect(screen.getByText('Özeti Dinle')).toBeInTheDocument();
  });

  it('hides chat button when onStartChat omitted', () => {
    setup({ onStartChat: undefined });
    expect(screen.queryByText('upgradeToChat')).not.toBeInTheDocument();
    expect(screen.queryByText('chatButton')).not.toBeInTheDocument();
  });

  it('renders audioPlayer slot', () => {
    setup();
    expect(screen.getByTestId('audio-slot')).toHaveTextContent('player');
  });
});
