import { describe, it, expect } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { SummarizeBusyOverlay } from '../SummarizeBusyOverlay';

const t = (k: string) => k;

describe('SummarizeBusyOverlay', () => {
  it('renders nothing when not open', () => {
    const { container } = render(
      <SummarizeBusyOverlay
        open={false}
        audioLoading={false}
        t={t as ComponentProps<typeof SummarizeBusyOverlay>['t']}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows summarizing copy when open and not audio loading', () => {
    render(
      <SummarizeBusyOverlay
        open
        audioLoading={false}
        t={t as ComponentProps<typeof SummarizeBusyOverlay>['t']}
      />
    );
    expect(screen.getByText('summarizingStatus')).toBeInTheDocument();
    expect(screen.getByText('waitMessage')).toBeInTheDocument();
  });

  it('shows audio loading copy when open and audioLoading', () => {
    render(
      <SummarizeBusyOverlay
        open
        audioLoading
        t={t as ComponentProps<typeof SummarizeBusyOverlay>['t']}
      />
    );
    expect(screen.getByText('preparingAudio')).toBeInTheDocument();
    expect(screen.getByText('waitAudioGen')).toBeInTheDocument();
  });

  it('uses Turkish title fallback when t returns empty (summarize)', () => {
    const tEmpty = (() => '') as ComponentProps<
      typeof SummarizeBusyOverlay
    >['t'];
    render(<SummarizeBusyOverlay open audioLoading={false} t={tEmpty} />);
    expect(screen.getByText('Yapay Zeka Özetliyor...')).toBeInTheDocument();
    expect(
      screen.getByText('PDF içeriği analiz ediliyor, lütfen bekleyin...')
    ).toBeInTheDocument();
  });

  it('uses Turkish title fallback when t returns empty (audio)', () => {
    const tEmpty = (() => '') as ComponentProps<
      typeof SummarizeBusyOverlay
    >['t'];
    render(<SummarizeBusyOverlay open audioLoading t={tEmpty} />);
    expect(screen.getByText('Ses hazırlanıyor...')).toBeInTheDocument();
    expect(screen.getByText('Bu işlem biraz sürebilir...')).toBeInTheDocument();
  });
});
