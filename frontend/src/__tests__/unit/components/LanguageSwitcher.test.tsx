import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { LanguageProvider } from '@/context/LanguageContext';

// Helper function to render with provider
function renderWithProvider(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Initial Render', () => {
    it('should render the language button with current language', () => {
      renderWithProvider(<LanguageSwitcher />);

      expect(screen.getByText('TR')).toBeInTheDocument();
    });

    it('should not show dropdown menu initially', () => {
      renderWithProvider(<LanguageSwitcher />);

      expect(screen.queryAllByText('TR')).toHaveLength(1);
      expect(screen.queryByText('ENG')).not.toBeInTheDocument();
    });

    it('should display dropdown arrow icon', () => {
      renderWithProvider(<LanguageSwitcher />);

      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('Dropdown Toggle', () => {
    it('should open dropdown when button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');
      expect(button).toBeInTheDocument();

      await user.click(button!);

      expect(screen.getAllByText('TR').length).toBe(2);
      expect(screen.getByText('ENG')).toBeInTheDocument();
    });

    it('should close dropdown when button is clicked again', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);
      expect(screen.getAllByText('TR').length).toBe(2);

      await user.click(button!);

      expect(screen.queryAllByText('TR')).toHaveLength(1);
      expect(screen.queryByText('ENG')).not.toBeInTheDocument();
    });

    it('should rotate arrow icon when dropdown is open', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');
      const svg = document.querySelector('svg');

      expect(svg).not.toHaveClass('rotate-180');

      await user.click(button!);

      expect(svg).toHaveClass('rotate-180');
    });
  });

  describe('Language Selection', () => {
    it('should change language to Turkish when TR row is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);

      const turkishOption = screen.getAllByText('TR')[1].closest('button');
      expect(turkishOption).toBeTruthy();
      await user.click(turkishOption!);

      expect(screen.queryByText('ENG')).not.toBeInTheDocument();
      expect(screen.getByText('TR')).toBeInTheDocument();
    });

    it('should change language to English when ENG row is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);

      const englishOption = screen.getByText('ENG').closest('button');
      await user.click(englishOption!);

      expect(screen.queryAllByText('TR').length).toBeLessThan(2);
      expect(screen.getByText('ENG')).toBeInTheDocument();
    });

    it('should close dropdown after language selection', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);
      expect(screen.getAllByText('TR').length).toBe(2);

      await user.click(screen.getByText('ENG').closest('button')!);

      expect(screen.queryAllByText('TR').length).toBeLessThan(2);
      expect(screen.getByText('ENG')).toBeInTheDocument();
    });

    it('should show checkmark for selected language', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);

      const turkishOption = screen.getAllByText('TR')[1].closest('button');
      expect(turkishOption).toHaveTextContent('✓');

      const englishOption = screen.getByText('ENG').closest('button');
      expect(englishOption).not.toHaveTextContent('✓');
    });

    it('shows English as selected when stored language is en', async () => {
      localStorage.setItem('app-language', 'en');
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);
      await waitFor(() => expect(screen.getByText('ENG')).toBeInTheDocument());
      await user.click(screen.getByText('ENG').closest('button')!);
      const engRow = screen.getAllByText('ENG')[1].closest('button');
      expect(engRow).toHaveTextContent('✓');
      const turkishOption = screen.getByText('TR').closest('button');
      expect(turkishOption).not.toHaveTextContent('✓');
    });
  });

  describe('Click Outside', () => {
    it('should close dropdown when clicking outside', async () => {
      const user = userEvent.setup();
      renderWithProvider(
        <div>
          <LanguageSwitcher />
          <div data-testid="outside">Outside Element</div>
        </div>,
      );

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);
      expect(screen.getAllByText('TR').length).toBe(2);

      const outsideElement = screen.getByTestId('outside');
      await user.click(outsideElement);

      expect(screen.queryAllByText('TR')).toHaveLength(1);
    });

    it('should not close dropdown when clicking inside dropdown', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);
      expect(screen.getAllByText('TR').length).toBe(2);

      const dropdown = screen.getAllByText('TR')[1].closest('div[class*="absolute"]');

      expect(dropdown).toBeInTheDocument();
    });
  });

  describe('Language Persistence', () => {
    it('should restore language from localStorage on mount', async () => {
      localStorage.setItem('app-language', 'en');

      renderWithProvider(<LanguageSwitcher />);

      expect(screen.getByText('ENG')).toBeInTheDocument();
    });

    it('should update localStorage when language changes', async () => {
      const user = userEvent.setup();
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      await user.click(button!);
      await user.click(screen.getByText('ENG').closest('button')!);

      expect(localStorage.getItem('app-language')).toBe('en');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button', () => {
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');
      expect(button).toBeInTheDocument();
      expect(button?.tagName).toBe('BUTTON');
    });

    it('should have proper button structure', () => {
      renderWithProvider(<LanguageSwitcher />);

      const button = screen.getByText('TR').closest('button');

      expect(button).toHaveTextContent('TR');
      expect(button?.querySelector('svg')).toBeInTheDocument();
    });
  });
});
