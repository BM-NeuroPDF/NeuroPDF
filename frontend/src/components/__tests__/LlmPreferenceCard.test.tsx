import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import type { Session } from 'next-auth';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LlmPreferenceCard } from '../LlmPreferenceCard';
import { sendRequest } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
}));

const mockedSendRequest = vi.mocked(sendRequest);

const t = (k: string) => k;

const session = {
  user: { name: 'A', email: 'a@b.com' },
  expires: '1',
} as Session;

function setup(
  overrides: Partial<ComponentProps<typeof LlmPreferenceCard>> = {}
) {
  const mutateLlm = vi.fn().mockResolvedValue(undefined);
  const props = {
    llmData: undefined as { provider?: string } | undefined,
    mutateLlm,
    session,
    t: t as ComponentProps<typeof LlmPreferenceCard>['t'],
    ...overrides,
  };
  const view = render(<LlmPreferenceCard {...props} />);
  return { ...view, mutateLlm, props };
}

describe('LlmPreferenceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing without session user', () => {
    const { container } = render(
      <LlmPreferenceCard
        llmData={undefined}
        mutateLlm={vi.fn()}
        session={null}
        t={t as ComponentProps<typeof LlmPreferenceCard>['t']}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows preference title and local features by default', () => {
    setup();
    expect(screen.getByText('aiPreference')).toBeInTheDocument();
    expect(screen.getByText('localFeatures')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('switches to cloud features', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Cloud LLM/i }));
    expect(screen.getByText('cloudFeatures')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('syncs choice from llmData provider', () => {
    const { rerender } = setup({ llmData: { provider: 'local' } });
    expect(screen.getByText('localFeatures')).toBeInTheDocument();
    rerender(
      <LlmPreferenceCard
        llmData={{ provider: 'CLOUD' }}
        mutateLlm={vi.fn()}
        session={session}
        t={t as ComponentProps<typeof LlmPreferenceCard>['t']}
      />
    );
    expect(screen.getByText('cloudFeatures')).toBeInTheDocument();
  });

  it('does not sync when provider is missing', () => {
    setup({ llmData: {} });
    expect(screen.getByText('localFeatures')).toBeInTheDocument();
  });

  it('saves choice and revalidates', async () => {
    mockedSendRequest.mockResolvedValue(undefined);
    const { mutateLlm } = setup();

    fireEvent.click(screen.getByRole('button', { name: /Cloud LLM/i }));
    fireEvent.click(screen.getByRole('button', { name: /savePreference/i }));

    await waitFor(() => {
      expect(mockedSendRequest).toHaveBeenCalledWith(
        '/files/user/update-llm',
        'POST',
        { provider: 'cloud' }
      );
    });
    expect(mutateLlm).toHaveBeenCalled();
  });

  it('alerts on save error', async () => {
    mockedSendRequest.mockRejectedValue(new Error('fail'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    setup();
    fireEvent.click(screen.getByRole('button', { name: /savePreference/i }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Hata oluştu.');
    });
    alertSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('shows saving label while loading', async () => {
    mockedSendRequest.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );
    setup();
    fireEvent.click(screen.getByRole('button', { name: /savePreference/i }));
    expect(screen.getByText('saving')).toBeInTheDocument();
  });

  it('shows Turkish saving label while loading when t is empty', async () => {
    mockedSendRequest.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 200))
    );
    const tEmpty = (() => '') as ComponentProps<typeof LlmPreferenceCard>['t'];
    render(
      <LlmPreferenceCard
        llmData={undefined}
        mutateLlm={vi.fn()}
        session={session}
        t={tEmpty}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Tercihi Kaydet/i }));
    expect(screen.getByText('Kaydediliyor...')).toBeInTheDocument();
  });

  it('uses Turkish fallbacks when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof LlmPreferenceCard>['t'];
    render(
      <LlmPreferenceCard
        llmData={undefined}
        mutateLlm={vi.fn()}
        session={session}
        t={tEmpty}
      />
    );
    expect(screen.getByText('AI Model Tercihi')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Tercihi Kaydet/i })
    ).toBeInTheDocument();
  });

  it('uses Turkish fallbacks for cloud feature bullets when t is empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof LlmPreferenceCard>['t'];
    render(
      <LlmPreferenceCard
        llmData={undefined}
        mutateLlm={vi.fn()}
        session={session}
        t={tEmpty}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cloud LLM/i }));
    expect(
      screen.getByText('En Yüksek Doğruluk (Gemini 1.5).')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Geniş bağlam ve karmaşık analiz.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Veriler işlenmek üzere gönderilir.')
    ).toBeInTheDocument();
  });

  it('handles explicit local selection click', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Cloud LLM/i }));
    fireEvent.click(screen.getByRole('button', { name: /Local LLM/i }));
    expect(screen.getByText('localFeatures')).toBeInTheDocument();
  });
});
