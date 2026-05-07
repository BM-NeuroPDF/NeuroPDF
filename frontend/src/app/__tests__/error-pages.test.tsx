import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotFoundPage from '@/app/not-found';
import GlobalError from '@/app/error';
import { captureException } from '@sentry/nextjs';

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

  it('renders global error page with event id and retry', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    expect(screen.getByText('appErrorTitle')).toBeInTheDocument();
    expect(screen.getByText(/evt_test_123/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'appErrorRetry' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('falls back to error digest when sentry id is empty', async () => {
    vi.mocked(captureException).mockReturnValueOnce(undefined as unknown as string);
    render(<GlobalError error={Object.assign(new Error('boom'), { digest: 'digest-42' })} reset={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/digest-42/i)).toBeInTheDocument();
    });
  });

  it('skips recent docs panel when cache is malformed', () => {
    window.localStorage.setItem('neuropdf-recent-documents', 'not-json');
    render(<NotFoundPage />);
    expect(screen.queryByText('notFoundRecentDocs')).not.toBeInTheDocument();
  });
});
