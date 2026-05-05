import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NavBar from '@/components/NavBar';
import { LanguageProvider } from '@/context/LanguageContext';

// Mock window.matchMedia (ThemeToggle için)
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

// Mock NextAuth (AuthBar için)
const mockSignOut = vi.fn();
const mockPush = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: null,
    status: 'unauthenticated',
    update: async () => null,
  })),
  signOut: () => mockSignOut(),
}));

// Mock Next.js Router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

// Import mocked modules
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

// Helper function to render with provider
function renderWithProvider(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('NavBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockSignOut.mockClear();
    // Default pathname: home page
    vi.mocked(usePathname).mockReturnValue('/');
    // Default session: unauthenticated
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: async () => null,
    } as unknown as ReturnType<typeof useSession>);
  });

  describe('Initial Render', () => {
    it('should render logo and brand name', () => {
      renderWithProvider(<NavBar />);

      // Logo görüntüsü olmalı
      const logo = document.querySelector('img[alt="Neuro PDF Logo"]');
      expect(logo).toBeInTheDocument();

      // Brand name görünmeli
      expect(screen.getByText(/Neuro/i)).toBeInTheDocument();
    });

    it('should render all navigation links', () => {
      renderWithProvider(<NavBar />);

      // Tüm nav linkleri görünmeli (desktop'ta)
      // Çeviri metinlerini kullan: navUpload="PDF Görüntüleme", navExtract="Sayfa Çıkar", vs.
      expect(screen.getByText(/PDF Görüntüleme|Upload/i)).toBeInTheDocument();
      expect(screen.getByText(/Sayfa Çıkar|Extract/i)).toBeInTheDocument();
      expect(screen.getByText(/Sayfa Düzenle|Edit/i)).toBeInTheDocument();
      expect(screen.getByText(/PDF Birleştir|Merge/i)).toBeInTheDocument();
      expect(screen.getByText(/PDF Özetleme|Summarize/i)).toBeInTheDocument();
      expect(screen.getByText('Pro')).toBeInTheDocument();
    });

    it('should render AuthBar component', () => {
      renderWithProvider(<NavBar />);

      // AuthBar içindeki login butonu görünmeli
      expect(screen.getByText(/Giriş|Login/i)).toBeInTheDocument();
    });

    it('should render LanguageSwitcher component', () => {
      renderWithProvider(<NavBar />);

      // LanguageSwitcher içindeki dil kodu görünmeli
      expect(screen.getByText('TR')).toBeInTheDocument();
    });
  });

  describe('Active Link Highlighting', () => {
    it('should highlight active link when on upload page', () => {
      vi.mocked(usePathname).mockReturnValue('/upload');

      renderWithProvider(<NavBar />);

      const uploadLink = screen.getByText(/PDF Görüntüleme|Upload/i).closest('a');
      expect(uploadLink).toHaveClass('bg-[var(--button-bg)]');
    });

    it('should highlight active link when on extract page', () => {
      vi.mocked(usePathname).mockReturnValue('/extract-pdf');

      renderWithProvider(<NavBar />);

      const extractLink = screen.getByText(/Sayfa Çıkar|Extract/i).closest('a');
      expect(extractLink).toHaveClass('bg-[var(--button-bg)]');
    });

    it('should highlight active link when on edit page', () => {
      vi.mocked(usePathname).mockReturnValue('/edit-pdf');

      renderWithProvider(<NavBar />);

      const editLink = screen.getByText(/Düzenle|Edit/i).closest('a');
      expect(editLink).toHaveClass('bg-[var(--button-bg)]');
    });

    it('should highlight home link when on root path', () => {
      vi.mocked(usePathname).mockReturnValue('/');

      renderWithProvider(<NavBar />);

      // Home linki aktif olmalı (logo linki)
      const homeLink = screen.getByText(/Neuro/i).closest('a');
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('should not highlight inactive links', () => {
      vi.mocked(usePathname).mockReturnValue('/upload');

      renderWithProvider(<NavBar />);

      // Upload aktif, diğerleri aktif olmamalı
      const extractLink = screen.getByText(/Sayfa Çıkar|Extract/i).closest('a');
      expect(extractLink).not.toHaveClass('bg-[var(--button-bg)]');
    });
  });

  describe('Mobile Menu', () => {
    it('should show hamburger button on mobile screens', () => {
      renderWithProvider(<NavBar />);

      // Hamburger butonu görünmeli (lg:hidden class'ı ile)
      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);
      expect(hamburgerButton).toBeInTheDocument();
      expect(hamburgerButton).toHaveClass('lg:hidden');
    });

    it('should open mobile menu when hamburger is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);

      // Menü başlangıçta kapalı olmalı
      expect(screen.queryByText(/Ayarlar|Settings/i)).not.toBeInTheDocument();

      // Hamburger'e tıkla
      await user.click(hamburgerButton);

      // Menü açılmalı
      expect(screen.getByText(/Ayarlar|Settings/i)).toBeInTheDocument();
    });

    it('should close mobile menu when hamburger is clicked again', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);

      // Menüyü aç
      await user.click(hamburgerButton);
      expect(screen.getByText(/Ayarlar|Settings/i)).toBeInTheDocument();

      // Tekrar tıkla (X ikonu görünmeli)
      await user.click(hamburgerButton);

      // Menü kapanmalı
      expect(screen.queryByText(/Ayarlar|Settings/i)).not.toBeInTheDocument();
    });

    it('should show X icon when menu is open', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);

      await user.click(hamburgerButton);

      // X ikonu görünmeli
      const closeButton = screen.getByLabelText(/Menüyü kapat|Close menu/i);
      expect(closeButton).toBeInTheDocument();
    });

    it('should close mobile menu when a link is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);

      // Menüyü aç
      await user.click(hamburgerButton);
      expect(screen.getByText(/Ayarlar|Settings/i)).toBeInTheDocument();

      // Mobil menüdeki linke tıkla (getAllByText kullan, mobil menüdeki olanı seç)
      const uploadLinks = screen.getAllByText(/PDF Görüntüleme|Upload/i);
      // Mobil menüdeki link (ikinci veya son link)
      const mobileUploadLink = uploadLinks[uploadLinks.length - 1];
      await user.click(mobileUploadLink);

      // Menü kapanmalı
      expect(screen.queryByText(/Ayarlar|Settings/i)).not.toBeInTheDocument();
    });

    it('should show all navigation links in mobile menu', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);
      await user.click(hamburgerButton);

      // Tüm linkler mobil menüde görünmeli (getAllByText kullan çünkü desktop'ta da var)
      expect(screen.getAllByText(/PDF Görüntüleme|Upload/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Sayfa Çıkar|Extract/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Sayfa Düzenle|Edit/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/PDF Birleştir|Merge/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/PDF Özetleme|Summarize/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Pro').length).toBeGreaterThan(0);
    });

    it('should show LanguageSwitcher in mobile menu', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);
      await user.click(hamburgerButton);

      // LanguageSwitcher mobil menüde görünmeli (getAllByText kullan çünkü desktop'ta da var)
      expect(screen.getAllByText('TR').length).toBeGreaterThan(0);
    });

    it('should show AuthBar in mobile menu', async () => {
      const user = userEvent.setup();
      renderWithProvider(<NavBar />);

      const hamburgerButton = screen.getByLabelText(/Menüyü aç|Open menu/i);
      await user.click(hamburgerButton);

      // AuthBar mobil menüde görünmeli (getAllByText kullan çünkü desktop'ta da var)
      expect(screen.getAllByText(/Giriş|Login/i).length).toBeGreaterThan(0);
    });
  });

  describe('Desktop Menu', () => {
    it('should hide mobile menu on desktop screens', () => {
      renderWithProvider(<NavBar />);

      // Mobil menü başlangıçta kapalı ve lg:hidden class'ı ile gizlenmiş olmalı
      const mobileMenu = document.querySelector('.lg\\:hidden');
      expect(mobileMenu).toBeInTheDocument();
    });

    it('should show desktop navigation links', () => {
      renderWithProvider(<NavBar />);

      // Desktop nav görünmeli (hidden lg:flex)
      const desktopNav = document.querySelector('.hidden.lg\\:flex');
      expect(desktopNav).toBeInTheDocument();
    });
  });

  describe('Pro Link Styling', () => {
    it('should apply special styling to Pro link', () => {
      renderWithProvider(<NavBar />);

      const proLink = screen.getByText('Pro').closest('a');

      // Pro linki özel gradient stil'e sahip olmalı
      expect(proLink).toHaveClass('bg-gradient-to-r');
      expect(proLink?.className).toContain('from-yellow-400');
    });
  });

  describe('Icon Rendering', () => {
    it('should render icons for navigation links', () => {
      renderWithProvider(<NavBar />);

      // Linklerde SVG ikonları olmalı
      const links = screen.getAllByRole('link');
      const linksWithIcons = links.filter((link) => link.querySelector('svg'));

      // En azından birkaç linkin ikonu olmalı
      expect(linksWithIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Mobile summarize link', () => {
    it('applies gold border when summarize is inactive', async () => {
      vi.mocked(usePathname).mockReturnValue('/upload');
      const user = userEvent.setup();
      const { container } = renderWithProvider(<NavBar />);
      await user.click(screen.getByLabelText(/Menüyü aç|Open menu/i));
      const link = container.querySelector('a[href="/summarize-pdf"]') as HTMLAnchorElement;
      expect(link.className).toMatch(/yellow/);
    });

    it('applies active styles when on summarize route', async () => {
      vi.mocked(usePathname).mockReturnValue('/summarize-pdf');
      const user = userEvent.setup();
      const { container } = renderWithProvider(<NavBar />);
      await user.click(screen.getByLabelText(/Menüyü aç|Open menu/i));
      const mobileNav = container.querySelector('.lg\\:hidden.py-4');
      const link = mobileNav?.querySelector('a[href="/summarize-pdf"]') as HTMLAnchorElement;
      expect(link.className).toMatch(/button-bg|shadow-sm/);
    });
  });

  describe('Authenticated State', () => {
    it('should show user info when authenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
        update: async () => null,
      } as unknown as ReturnType<typeof useSession>);

      renderWithProvider(<NavBar />);

      // Profil butonu statik metinle görünmeli
      expect(screen.getByText(/Profilim|My Profile/i)).toBeInTheDocument();
      expect(screen.getByText(/Çıkış|Sign Out/i)).toBeInTheDocument();
    });
  });
});
