import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummaryAudioPlayer } from '../SummaryAudioPlayer';

const t = (k: string) => k;

function setup(overrides: Partial<ComponentProps<typeof SummaryAudioPlayer>> = {}) {
  const onTogglePlay = vi.fn();
  const onSeek = vi.fn();
  const onSkip = vi.fn();
  const props = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    audioLoading: false,
    onTogglePlay,
    onSeek,
    onSkip,
    t: t as ComponentProps<typeof SummaryAudioPlayer>['t'],
    ...overrides,
  };
  const view = render(<SummaryAudioPlayer {...props} />);
  return { ...view, onTogglePlay, onSeek, onSkip, props };
}

describe('SummaryAudioPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats timeline as 00:00 when duration is zero', () => {
    setup({ currentTime: 0, duration: 0 });
    const times = screen.getAllByText('00:00');
    expect(times.length).toBeGreaterThanOrEqual(2);
  });

  it('formats non-zero times', () => {
    setup({ currentTime: 65, duration: 125 });
    expect(screen.getByText('01:05')).toBeInTheDocument();
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('formats times with double-digit minutes and seconds', () => {
    setup({ currentTime: 650, duration: 650 });
    expect(screen.getAllByText('10:50').length).toBe(2);
  });

  it('uses fallback download title when t returns empty', () => {
    const tEmpty = ((k: string) => (k === 'downloadAudio' ? '' : k)) as ComponentProps<
      typeof SummaryAudioPlayer
    >['t'];
    const onDownload = vi.fn();
    setup({ onDownload, t: tEmpty });
    expect(screen.getByTitle('Sesi İndir (MP3)')).toBeInTheDocument();
  });

  it('calls onTogglePlay when play button clicked', () => {
    const { onTogglePlay } = setup();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('shows pause icon when isPlaying', () => {
    setup({ isPlaying: true });
    const svgPaths = document.querySelectorAll('path[d="M15.75 5.25v13.5m-7.5-13.5v13.5"]');
    expect(svgPaths.length).toBeGreaterThan(0);
  });

  it('calls onSkip with -10 and +10', () => {
    const { onSkip } = setup();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[2]);
    expect(onSkip).toHaveBeenCalledWith(-10);
    expect(onSkip).toHaveBeenCalledWith(10);
  });

  it('calls onSeek when range changes', () => {
    const { onSeek } = setup({ duration: 100, currentTime: 0 });
    const range = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range).toBeTruthy();
    fireEvent.change(range, { target: { value: '30' } });
    expect(onSeek).toHaveBeenCalled();
  });

  it('renders download control when onDownload provided', () => {
    const onDownload = vi.fn();
    setup({ onDownload });
    const dl = screen.getByTitle('downloadAudio');
    fireEvent.click(dl);
    expect(onDownload).toHaveBeenCalled();
  });

  it('does not render download when onDownload omitted', () => {
    setup();
    expect(screen.queryByTitle('downloadAudio')).not.toBeInTheDocument();
  });

  it('disables range and skip/play when audioLoading', () => {
    setup({ audioLoading: true, duration: 60, onDownload: vi.fn() });
    const range = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range.disabled).toBe(true);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).toBeDisabled();
    expect(buttons[3]).not.toBeDisabled();
  });
});
