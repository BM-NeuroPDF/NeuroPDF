import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileHeroCard } from '../ProfileHeroCard';

const t = (k: string) => k;

const baseStats = {
  summary_count: 2,
  tools_count: 5,
  role: 'Pro',
};

function setup(
  overrides: Partial<ComponentProps<typeof ProfileHeroCard>> = {}
) {
  const onSignOut = vi.fn();
  const onEditAvatar = vi.fn();
  const onOpenDocuments = vi.fn();
  const view = render(
    <ProfileHeroCard
      user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
      avatarSrc={null}
      stats={baseStats}
      onSignOut={onSignOut}
      onEditAvatar={onEditAvatar}
      onOpenDocuments={onOpenDocuments}
      t={t as ComponentProps<typeof ProfileHeroCard>['t']}
      {...overrides}
    />
  );
  return { ...view, onSignOut, onEditAvatar, onOpenDocuments };
}

describe('ProfileHeroCard', () => {
  it('renders avatar image when src is set', () => {
    setup({ avatarSrc: 'https://example.com/a.png' });
    expect(screen.getByAltText('Profil Resmi')).toHaveAttribute(
      'src',
      'https://example.com/a.png'
    );
  });

  it('renders initials when no avatar', () => {
    setup();
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('uses default user label for initials when name missing', () => {
    setup({ user: { name: null, email: 'x@y.com' } });
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('uses Kullanıcı fallback for initials when name and t defaultUser are empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileHeroCard>['t'];
    setup({
      user: { name: null, email: 'x@y.com' },
      t: tEmpty,
    });
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('sets empty email title when email missing', () => {
    const { container } = setup({ user: { name: 'A', email: null } });
    const emailP = container.querySelector('p.truncate.w-full.mb-6');
    expect(emailP).toHaveAttribute('title', '');
  });

  it('uses single-letter initials for one word name', () => {
    setup({ user: { name: 'Madonna', email: 'm@x.com' } });
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('fires callbacks', () => {
    const { onSignOut, onEditAvatar, onOpenDocuments } = setup();
    fireEvent.click(screen.getByTitle('changeProfileImage'));
    fireEvent.click(screen.getByRole('button', { name: /navDocuments/i }));
    fireEvent.click(screen.getByRole('button', { name: /signOut/i }));
    expect(onEditAvatar).toHaveBeenCalled();
    expect(onOpenDocuments).toHaveBeenCalled();
    expect(onSignOut).toHaveBeenCalled();
  });

  it('shows document count from stats.tools_count', () => {
    setup({ stats: { ...baseStats, tools_count: 12 } });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('documentCountLabel')).toBeInTheDocument();
  });

  it('uses Turkish fallbacks when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileHeroCard>['t'];
    render(
      <ProfileHeroCard
        user={{ name: 'N', email: 'e@e.com' }}
        avatarSrc={null}
        stats={baseStats}
        onSignOut={vi.fn()}
        onEditAvatar={vi.fn()}
        onOpenDocuments={vi.fn()}
        t={tEmpty}
      />
    );
    expect(screen.getByTitle('Profil Resmini Değiştir')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Belgelerim/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Çıkış Yap/i })
    ).toBeInTheDocument();
  });
});
