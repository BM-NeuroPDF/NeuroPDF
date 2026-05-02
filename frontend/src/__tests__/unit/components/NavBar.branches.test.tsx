import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import NavBar, { isNavLinkActive } from '@/components/NavBar';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: null,
    status: 'unauthenticated',
    update: async () => null,
  })),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: vi.fn(() => '/'),
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<
    { href: string } & Omit<React.ComponentPropsWithoutRef<'a'>, 'href'>
  >) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/context/LanguageContext', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useLanguage: () => ({
    language: 'tr' as const,
    setLanguage: vi.fn(),
    t: (key: string) => {
      if (
        key.startsWith('nav') ||
        key === 'navUpload' ||
        key === 'navExtract' ||
        key === 'navEdit' ||
        key === 'navMerge' ||
        key === 'navSummarize'
      ) {
        return '';
      }
      if (key === 'loginLink') return 'Giriş';
      return key;
    },
  }),
}));

import { usePathname } from 'next/navigation';

describe('isNavLinkActive', () => {
  it('matches home only on exact /', () => {
    expect(isNavLinkActive('/', '/')).toBe(true);
    expect(isNavLinkActive('/upload', '/')).toBe(false);
    expect(isNavLinkActive(undefined, '/')).toBe(false);
  });

  it('matches other routes by prefix', () => {
    expect(isNavLinkActive('/upload/foo', '/upload')).toBe(true);
    expect(isNavLinkActive('/', '/upload')).toBe(false);
  });
});

describe('NavBar branches (fallback labels & pathname)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/');
  });

  it('uses Turkish fallback labels when nav translations are empty', () => {
    render(<NavBar />);

    expect(screen.getAllByText('Yükle').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ayıkla').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Düzenle').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Birleştir').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Özetle').length).toBeGreaterThan(0);
  });

  it('does not mark route active when pathname is undefined', () => {
    vi.mocked(usePathname).mockReturnValue(
      undefined as unknown as ReturnType<typeof usePathname>
    );

    render(<NavBar />);

    const uploadLink = screen.getAllByText('Yükle')[0].closest('a');
    expect(uploadLink).not.toHaveClass('bg-[var(--button-bg)]');
  });
});
