import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthBar from '@/components/AuthBar';
import { LanguageProvider } from '@/context/LanguageContext';

// Mock NextAuth
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

// Import mocked modules
import { useSession } from 'next-auth/react';

// Helper function to render with provider
function renderWithProvider(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('AuthBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockSignOut.mockClear();
  });

  describe('Loading State', () => {
    it('should show skeleton when session is loading', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Skeleton gösterilmeli (animate-pulse class'ı ile)
      const skeleton = document.querySelector('.animate-pulse');
      expect(skeleton).toBeInTheDocument();
    });

    it('should not show login button or user info when loading', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'loading',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Giriş butonu veya kullanıcı bilgileri görünmemeli
      expect(screen.queryByText(/Giriş|Login/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Çıkış|Sign Out/i)).not.toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('should show login button when user is not authenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Giriş butonu görünmeli
      const loginButton = screen.getByText(/Giriş|Login/i);
      expect(loginButton).toBeInTheDocument();
    });

    it('should navigate to login page when login button is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      const loginButton = screen.getByText(/Giriş|Login/i);
      await user.click(loginButton);

      // Router.push('/login') çağrılmalı
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('should not show user info or sign out button when unauthenticated', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Kullanıcı bilgileri veya çıkış butonu görünmemeli
      expect(screen.queryByText(/Çıkış|Sign Out/i)).not.toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    const mockUser = {
      name: 'Test User',
      email: 'test@example.com',
    };

    beforeEach(() => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: mockUser,
        },
        status: 'authenticated',
        update: async () => null,
      } as any);
    });

    it('should show static profile label when authenticated', () => {
      renderWithProvider(<AuthBar />);

      // Kullanıcı adı yerine sabit profil metni görünmeli
      expect(screen.getByText(/Profilim|My Profile/i)).toBeInTheDocument();
    });

    it('should still show profile label when name is not available', () => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Profil metni sabit olmalı
      expect(screen.getByText(/Profilim|My Profile/i)).toBeInTheDocument();
    });

    it('should show sign out button when authenticated', () => {
      renderWithProvider(<AuthBar />);

      // Çıkış butonu görünmeli
      const signOutButton = screen.getByText(/Çıkış|Sign Out/i);
      expect(signOutButton).toBeInTheDocument();
    });

    it('should call signOut when sign out button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<AuthBar />);

      const signOutButton = screen.getByText(/Çıkış|Sign Out/i);
      await user.click(signOutButton);

      // signOut fonksiyonu çağrılmalı
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('should navigate to profile when profile button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<AuthBar />);

      // Profil butonunu bul
      const profileButton = screen.getByText(/Profilim|My Profile/i);
      await user.click(profileButton);

      // Router.push('/profile') çağrılmalı
      expect(mockPush).toHaveBeenCalledWith('/profile');
    });

    it('should have user icon in profile button', () => {
      renderWithProvider(<AuthBar />);

      // Profil butonu içinde SVG ikonu olmalı
      const profileButton = screen
        .getByText(/Profilim|My Profile/i)
        .closest('button');
      const svgIcon = profileButton?.querySelector('svg');
      expect(svgIcon).toBeInTheDocument();
    });

    it('should show sign out button with correct styling', () => {
      renderWithProvider(<AuthBar />);

      const signOutButton = screen.getByText(/Çıkış|Sign Out/i);

      // Çıkış butonu kırmızı renkli olmalı
      expect(signOutButton).toHaveClass('text-red-600');
    });
  });

  describe('Responsive Behavior', () => {
    it('should keep profile button visible on all screens', () => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      const profileButton = screen
        .getByText(/Profilim|My Profile/i)
        .closest('button');
      expect(profileButton).toHaveClass('flex');
    });

    it('should hide profile text under xl breakpoint', () => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      const profileLabel = screen.getByText(/Profilim|My Profile/i);
      expect(profileLabel).toHaveClass('hidden', 'xl:inline');
    });

    it('should show sign out button on all screen sizes', () => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Çıkış butonu tüm ekran boyutlarında görünür olmalı
      const signOutButton = screen.getByText(/Çıkış|Sign Out/i);
      expect(signOutButton).not.toHaveClass('hidden');
    });
  });

  describe('Translation Integration', () => {
    it('should use translation for login button', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Translation fonksiyonu kullanılarak buton metni gösterilmeli
      const loginButton = screen.getByText(/Giriş|Login/i);
      expect(loginButton).toBeInTheDocument();
    });

    it('should use translation for sign out button', () => {
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            name: 'Test User',
          },
        },
        status: 'authenticated',
        update: async () => null,
      } as any);

      renderWithProvider(<AuthBar />);

      // Translation fonksiyonu kullanılarak çıkış butonu metni gösterilmeli
      const signOutButton = screen.getByText(/Çıkış|Sign Out/i);
      expect(signOutButton).toBeInTheDocument();
    });
  });
});
