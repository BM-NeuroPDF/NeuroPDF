import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthBar from '@/components/AuthBar';

const mockSignOut = vi.fn();
const mockPush = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: () => mockSignOut(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/context/LanguageContext', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useLanguage: () => ({
    language: 'tr' as const,
    setLanguage: vi.fn(),
    t: (key: string) => {
      if (key === 'myProfile') return '';
      if (key === 'signOut') return 'Çıkış';
      return key;
    },
  }),
}));

import { useSession } from 'next-auth/react';

describe('AuthBar translation fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses Profilim fallback when myProfile translation is empty', () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: 'a@b.com' } },
      status: 'authenticated',
      update: async () => null,
    } as any);

    render(<AuthBar />);

    expect(screen.getByTitle('Profilim')).toBeInTheDocument();
    expect(screen.getByText('Profilim')).toBeInTheDocument();
  });

  it('still navigates to profile when fallback label is shown', async () => {
    const user = userEvent.setup();
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: 'a@b.com' } },
      status: 'authenticated',
      update: async () => null,
    } as any);

    render(<AuthBar />);

    await user.click(screen.getByText('Profilim'));
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });
});
