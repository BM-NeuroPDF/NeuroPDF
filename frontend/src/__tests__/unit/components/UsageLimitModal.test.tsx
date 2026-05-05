import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsageLimitModal from '@/components/UsageLimitModal';

const getModalCloseButton = () =>
  screen.getAllByRole('button', { name: /Kapat/i }).find((el) => el.tagName === 'BUTTON');

describe('UsageLimitModal', () => {
  const mockOnClose = vi.fn();
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should not render when isOpen is false', () => {
      render(<UsageLimitModal isOpen={false} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Modal DOM'da olmamalı
      expect(screen.queryByText(/Kullanım Limitine Ulaştınız/i)).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Modal başlığı görünmeli
      expect(screen.getByText(/Kullanım Limitine Ulaştınız/i)).toBeInTheDocument();
    });

    it('should render backdrop when open', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Backdrop görünmeli (bg-black bg-opacity-50 class'ları ile)
      const backdrop = document.querySelector('.bg-black.bg-opacity-50');
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe('Close Actions', () => {
    it('should call onClose when backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Backdrop'u bul ve tıkla (bg-black bg-opacity-50 class'ları ile)
      const backdrop = document.querySelector('.bg-black.bg-opacity-50');
      expect(backdrop).toBeInTheDocument();

      await user.click(backdrop!);

      // onClose çağrılmalı
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // "Kapat" butonunu bul ve tıkla
      const closeButton = screen.getByText(/Kapat/i);
      await user.click(closeButton);

      // onClose çağrılmalı
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when modal content is clicked', async () => {
      const user = userEvent.setup();
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Modal içeriğine tıkla (backdrop değil)
      const modalContent = screen.getByText(/Kullanım Limitine Ulaştınız/i).closest('.bg-white');
      expect(modalContent).toBeInTheDocument();

      await user.click(modalContent!);

      // onClose çağrılmamalı (sadece backdrop'a tıklanınca çağrılır)
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Login Action', () => {
    it('should call onLogin when login button is clicked', async () => {
      const user = userEvent.setup();
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // "Giriş Yap" butonunu bul ve tıkla (getByRole kullan)
      const loginButton = screen.getByRole('button', { name: /Giriş Yap/i });
      await user.click(loginButton);

      // onLogin çağrılmalı
      expect(mockOnLogin).toHaveBeenCalledTimes(1);
    });

    it('should have correct styling on login button', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Login butonunu bul (getByRole kullan)
      const loginButton = screen.getByRole('button', { name: /Giriş Yap/i });

      // Login butonu kırmızı renkli olmalı
      expect(loginButton).toHaveClass('bg-red-600');
      expect(loginButton).toHaveClass('text-white');
    });
  });

  describe('Dynamic Content', () => {
    it('should display default usage count (3/3)', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Varsayılan kullanım bilgisi görünmeli
      expect(screen.getByText(/3 \/ 3/i)).toBeInTheDocument();
    });

    it('should display custom usage count', () => {
      render(
        <UsageLimitModal
          isOpen={true}
          onClose={mockOnClose}
          onLogin={mockOnLogin}
          usageCount={2}
          maxUsage={5}
        />,
      );

      // Özel kullanım bilgisi görünmeli
      expect(screen.getByText(/2 \/ 5/i)).toBeInTheDocument();
    });

    it('should display usage limit message', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Limit mesajı görünmeli
      expect(
        screen.getByText(/Ücretsiz kullanım hakkınızın tamamını kullandınız/i),
      ).toBeInTheDocument();
    });

    it('should display benefits list', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Avantajlar listesi görünmeli
      expect(screen.getByText(/Sınırsız PDF işlemi/i)).toBeInTheDocument();
      expect(screen.getByText(/Dosyalarınızı saklayın/i)).toBeInTheDocument();
      expect(screen.getByText(/Gelişmiş AI özellikleri/i)).toBeInTheDocument();
    });

    it('should display "Giriş yaparak:" header', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Başlık görünmeli
      expect(screen.getByText(/Giriş yaparak:/i)).toBeInTheDocument();
    });
  });

  describe('Modal Structure', () => {
    it('should render warning icon', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Uyarı ikonu görünmeli (SVG)
      const iconContainer = document.querySelector('.bg-red-100');
      expect(iconContainer).toBeInTheDocument();

      const svgIcon = iconContainer?.querySelector('svg');
      expect(svgIcon).toBeInTheDocument();
    });

    it('should have correct modal styling', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Modal container doğru class'lara sahip olmalı
      const modal = screen.getByText(/Kullanım Limitine Ulaştınız/i).closest('.bg-white');
      expect(modal).toHaveClass('rounded-2xl');
      expect(modal).toHaveClass('max-w-md');
    });

    it('should have centered modal positioning', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Modal container flex ve centered olmalı
      const container = document.querySelector('.fixed.inset-0.flex.items-center.justify-center');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Button Layout', () => {
    it('should render both login and close buttons', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Her iki buton da görünmeli (getByRole kullan)
      expect(screen.getByRole('button', { name: /Giriş Yap/i })).toBeInTheDocument();
      expect(getModalCloseButton()).toBeInTheDocument();
    });

    it('should have responsive button layout', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Butonlar flex-col sm:flex-row layout'a sahip olmalı
      const loginButton = screen.getByRole('button', { name: /Giriş Yap/i });
      const buttonContainer = loginButton.closest('.flex-col');
      expect(buttonContainer).toHaveClass('sm:flex-row');
    });
  });

  describe('Accessibility', () => {
    it('should have proper modal structure', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Modal başlığı görünmeli
      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(/Kullanım Limitine Ulaştınız/i);
    });

    it('should have clickable buttons', () => {
      render(<UsageLimitModal isOpen={true} onClose={mockOnClose} onLogin={mockOnLogin} />);

      // Butonları getByRole ile bul
      const loginButton = screen.getByRole('button', { name: /Giriş Yap/i });
      const closeButton = getModalCloseButton();

      // Butonlar button elementi olmalı
      expect(loginButton.tagName).toBe('BUTTON');
      expect(closeButton?.tagName).toBe('BUTTON');
    });
  });
});
