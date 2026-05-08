import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotFoundPage from '@/app/not-found';
import SegmentError from '@/app/error';
import RootGlobalError from '@/app/global-error';
import * as SentryNext from '@sentry/nextjs';

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(() => 'evt_test_123'),
}));

describe('error pages', () => {
  it('renders not-found page with go-home and recent section', () => {
    window.localStorage.setItem(
      'neuropdf-recent-documents',
      JSON.stringify([{ id: '1', name: 'Doc A' }]),
    );

    render(<NotFoundPage />);

    expect(screen.getByText('notFoundTitle')).toBeInTheDocument();
    expect(screen.getByText('notFoundGoHome')).toBeInTheDocument();
    expect(screen.getByText('notFoundRecentDocs')).toBeInTheDocument();
    expect(screen.getByText('Doc A')).toBeInTheDocument();
  });

  it('renders segment error page with event id and retry', async () => {
    const reset = vi.fn();
    render(<SegmentError error={new Error('boom')} reset={reset} />);

    expect(screen.getByText('appErrorTitle')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/evt_test_123/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'appErrorRetry' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('falls back to error digest when sentry id is empty (segment error)', async () => {
    vi.mocked(SentryNext.captureException).mockReturnValueOnce(undefined as unknown as string);
    render(
      <SegmentError
        error={Object.assign(new Error('boom'), { digest: 'digest-42' })}
        reset={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/digest-42/i)).toBeInTheDocument();
    });
  });

  it('renders root global-error with lazy Sentry capture and retry', async () => {
    const reset = vi.fn();
    render(<RootGlobalError error={new Error('root boom')} reset={reset} />);

    expect(screen.getByRole('heading', { name: /Bir şeyler ters gitti/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/evt_test_123/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('global-error falls back to digest when Sentry returns empty id', async () => {
    vi.mocked(SentryNext.captureException).mockReturnValueOnce(undefined as unknown as string);
    render(
      <RootGlobalError
        error={Object.assign(new Error('x'), { digest: 'dg-root' })}
        reset={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/dg-root/i)).toBeInTheDocument();
    });
  });

  it('skips recent docs panel when cache is malformed', () => {
    window.localStorage.setItem('neuropdf-recent-documents', 'not-json');
    render(<NotFoundPage />);
    expect(screen.queryByText('notFoundRecentDocs')).not.toBeInTheDocument();
  });
});
