import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { useSummaryAudio } from '../useSummaryAudio';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

function syntheticRangeChange(value: string): ChangeEvent<HTMLInputElement> {
  return { target: { value } } as ChangeEvent<HTMLInputElement>;
}

describe('useSummaryAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn(
      () => 'blob:mock-default'
    ) as typeof URL.createObjectURL;
    window.URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  });

  it('exposes initial state', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 'hello' }));
    expect(result.current.audioUrl).toBeNull();
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.audioLoading).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
  });

  it('resetAudio clears playback state', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 'x' }));
    act(() => {
      result.current.resetAudio();
    });
    expect(result.current.audioUrl).toBeNull();
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
  });

  it('requestAudio returns early when summary is empty', async () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: '' }));
    await act(async () => {
      await result.current.requestAudio();
    });
    expect(mockedSendRequest).not.toHaveBeenCalled();
  });

  it('requestAudio fetches blob and sets url', async () => {
    const onClearError = vi.fn();
    const blob = new Blob(['x'], { type: 'audio/mpeg' });
    mockedSendRequest.mockResolvedValue(blob);
    vi.mocked(window.URL.createObjectURL).mockReturnValue('blob:test');

    const { result } = renderHook(() =>
      useSummaryAudio({ summary: 'text', onClearError })
    );

    await act(async () => {
      await result.current.requestAudio();
    });

    expect(onClearError).toHaveBeenCalled();
    expect(mockedSendRequest).toHaveBeenCalledWith(
      '/files/listen-summary',
      'POST',
      { text: 'text' }
    );
    expect(result.current.audioBlob).toBe(blob);
    expect(result.current.audioUrl).toBe('blob:test');
    expect(result.current.audioLoading).toBe(false);
  });

  it('requestAudio succeeds without optional callbacks', async () => {
    const blob = new Blob(['x']);
    mockedSendRequest.mockResolvedValue(blob);
    vi.mocked(window.URL.createObjectURL).mockReturnValue('blob:x');

    const { result } = renderHook(() => useSummaryAudio({ summary: 't' }));

    await act(async () => {
      await result.current.requestAudio();
    });

    expect(result.current.audioBlob).toBe(blob);
  });

  it('requestAudio invokes onTtsError when response is not a Blob', async () => {
    const onTtsError = vi.fn();
    mockedSendRequest.mockResolvedValue({});
    const { result } = renderHook(() =>
      useSummaryAudio({ summary: 't', onTtsError })
    );
    await act(async () => {
      await result.current.requestAudio();
    });
    expect(onTtsError).toHaveBeenCalled();
  });

  it('requestAudio invokes onTtsError when sendRequest throws', async () => {
    const onTtsError = vi.fn();
    mockedSendRequest.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() =>
      useSummaryAudio({ summary: 't', onTtsError })
    );
    await act(async () => {
      await result.current.requestAudio();
    });
    expect(onTtsError).toHaveBeenCalled();
  });

  it('requestAudio calls togglePlay when audioUrl already exists', async () => {
    const blob = new Blob(['x']);
    mockedSendRequest.mockResolvedValue(blob);
    vi.mocked(window.URL.createObjectURL).mockReturnValue('blob:u');

    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const play = vi.fn().mockResolvedValue(undefined);
    const mockAudio = {
      paused: true,
      play,
      pause: vi.fn(),
      currentTime: 0,
      duration: 100,
    } as unknown as HTMLAudioElement;

    await act(async () => {
      await result.current.requestAudio();
    });
    result.current.audioRef.current = mockAudio;

    await act(async () => {
      await result.current.requestAudio();
    });

    expect(play).toHaveBeenCalled();
  });

  it('togglePlay does nothing when ref is null', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    act(() => {
      result.current.togglePlay();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('togglePlay pauses when not paused', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const pause = vi.fn();
    result.current.audioRef.current = {
      paused: false,
      play: vi.fn(),
      pause,
    } as unknown as HTMLAudioElement;
    act(() => {
      result.current.togglePlay();
    });
    expect(pause).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('togglePlay plays when paused and handles play rejection', async () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const play = vi.fn().mockRejectedValue(new Error('blocked'));
    result.current.audioRef.current = {
      paused: true,
      play,
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;
    await act(async () => {
      result.current.togglePlay();
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
  });

  it('togglePlay plays when paused and play resolves', async () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const play = vi.fn().mockResolvedValue(undefined);
    result.current.audioRef.current = {
      paused: true,
      play,
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;
    await act(async () => {
      result.current.togglePlay();
      await Promise.resolve();
    });
    expect(result.current.isPlaying).toBe(true);
  });

  it('seek updates currentTime when ref set', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const el = { currentTime: 0 } as HTMLAudioElement;
    result.current.audioRef.current = el;
    act(() => {
      result.current.seek(syntheticRangeChange('12.5'));
    });
    expect(el.currentTime).toBe(12.5);
    expect(result.current.currentTime).toBe(12.5);
  });

  it('seek no-ops when ref null', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    act(() => {
      result.current.seek(syntheticRangeChange('5'));
    });
    expect(result.current.currentTime).toBe(0);
  });

  it('skipBy adjusts currentTime when ref set', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    result.current.audioRef.current = { currentTime: 10 } as HTMLAudioElement;
    act(() => {
      result.current.skipBy(5);
    });
    expect(result.current.audioRef.current!.currentTime).toBe(15);
  });

  it('skipBy no-ops when ref null', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    act(() => {
      result.current.skipBy(3);
    });
    expect(result.current.audioRef.current).toBeNull();
  });

  it('downloadAudio no-ops without blob', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    act(() => {
      result.current.downloadAudio();
    });
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('downloadAudio triggers anchor download when blob present', async () => {
    const blob = new Blob(['a']);
    mockedSendRequest.mockResolvedValue(blob);
    vi.mocked(window.URL.createObjectURL).mockReturnValue('blob:dl');
    const revoke = vi.mocked(window.URL.revokeObjectURL);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    await act(async () => {
      await result.current.requestAudio();
    });

    act(() => {
      result.current.downloadAudio();
    });

    expect(clickSpy).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it('onTimeUpdate reads currentTime from element', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    result.current.audioRef.current = { currentTime: 42 } as HTMLAudioElement;
    act(() => {
      result.current.onTimeUpdate();
    });
    expect(result.current.currentTime).toBe(42);
  });

  it('onTimeUpdate no-ops without ref', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    act(() => {
      result.current.onTimeUpdate();
    });
    expect(result.current.currentTime).toBe(0);
  });

  it('onLoadedMetadata sets duration and auto-plays', async () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const play = vi.fn().mockResolvedValue(undefined);
    result.current.audioRef.current = {
      duration: 99,
      play,
    } as unknown as HTMLAudioElement;
    await act(async () => {
      result.current.onLoadedMetadata();
      await Promise.resolve();
    });
    expect(result.current.duration).toBe(99);
    expect(result.current.isPlaying).toBe(true);
  });

  it('onLoadedMetadata handles play rejection', async () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    const play = vi.fn().mockRejectedValue(new Error('x'));
    result.current.audioRef.current = {
      duration: 1,
      play,
    } as unknown as HTMLAudioElement;
    await act(async () => {
      result.current.onLoadedMetadata();
      await Promise.resolve();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('onLoadedMetadata no-ops without ref', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    act(() => {
      result.current.onLoadedMetadata();
    });
    expect(result.current.duration).toBe(0);
  });

  it('onEnded onPause onPlay update isPlaying', () => {
    const { result } = renderHook(() => useSummaryAudio({ summary: 's' }));
    act(() => {
      result.current.onPlay();
    });
    expect(result.current.isPlaying).toBe(true);
    act(() => {
      result.current.onPause();
    });
    expect(result.current.isPlaying).toBe(false);
    act(() => {
      result.current.onPlay();
    });
    act(() => {
      result.current.onEnded();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('unmount revokes object URL when audioUrl was set', async () => {
    const blob = new Blob(['x']);
    mockedSendRequest.mockResolvedValue(blob);
    vi.mocked(window.URL.createObjectURL).mockReturnValue('blob:revoke-me');
    const revoke = vi.mocked(window.URL.revokeObjectURL);

    const { result, unmount } = renderHook(() =>
      useSummaryAudio({ summary: 's' })
    );
    await act(async () => {
      await result.current.requestAudio();
    });
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:revoke-me');
  });

  it('unmount does not revoke when audioUrl was never set', () => {
    const revoke = vi.mocked(window.URL.revokeObjectURL);
    const { unmount } = renderHook(() => useSummaryAudio({ summary: 's' }));
    unmount();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('uses latest onTtsError after rerender', async () => {
    const err1 = vi.fn();
    const err2 = vi.fn();
    mockedSendRequest.mockRejectedValue(new Error('fail'));

    const { result, rerender } = renderHook(
      ({ onTts }: { onTts: () => void }) =>
        useSummaryAudio({ summary: 's', onTtsError: onTts }),
      { initialProps: { onTts: err1 } }
    );

    await act(async () => {
      await result.current.requestAudio();
    });
    expect(err1).toHaveBeenCalledTimes(1);

    mockedSendRequest.mockRejectedValue(new Error('fail2'));
    rerender({ onTts: err2 });

    await act(async () => {
      await result.current.requestAudio();
    });
    expect(err2).toHaveBeenCalledTimes(1);
  });
});
