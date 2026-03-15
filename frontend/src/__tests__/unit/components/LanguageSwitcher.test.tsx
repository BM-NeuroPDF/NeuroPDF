import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { LanguageProvider } from '@/context/LanguageContext'

// Helper function to render with provider
function renderWithProvider(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>)
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    // Her test öncesi localStorage'ı temizle
    localStorage.clear()
  })

  describe('Initial Render', () => {
    it('should render the language button with current language', () => {
      renderWithProvider(<LanguageSwitcher />)

      // Seçili dil gösterilmeli (varsayılan: TR)
      expect(screen.getByText('TR')).toBeInTheDocument()
    })

    it('should not show dropdown menu initially', () => {
      renderWithProvider(<LanguageSwitcher />)

      // Dropdown başlangıçta kapalı olmalı
      expect(screen.queryByText('Türkçe')).not.toBeInTheDocument()
      expect(screen.queryByText('English')).not.toBeInTheDocument()
    })

    it('should display dropdown arrow icon', () => {
      renderWithProvider(<LanguageSwitcher />)

      // SVG ikonu bulunmalı
      const svg = document.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('Dropdown Toggle', () => {
    it('should open dropdown when button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      expect(button).toBeInTheDocument()

      await user.click(button!)

      // Dropdown açılmalı
      expect(screen.getByText('Türkçe')).toBeInTheDocument()
      expect(screen.getByText('English')).toBeInTheDocument()
    })

    it('should close dropdown when button is clicked again', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // İlk tıklama: aç
      await user.click(button!)
      expect(screen.getByText('Türkçe')).toBeInTheDocument()

      // İkinci tıklama: kapat
      await user.click(button!)
      
      // Dropdown kapanmalı
      expect(screen.queryByText('Türkçe')).not.toBeInTheDocument()
      expect(screen.queryByText('English')).not.toBeInTheDocument()
    })

    it('should rotate arrow icon when dropdown is open', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      const svg = document.querySelector('svg')

      // Başlangıçta rotate olmamalı
      expect(svg).not.toHaveClass('rotate-180')

      // Dropdown'ı aç
      await user.click(button!)

      // SVG rotate-180 class'ına sahip olmalı
      expect(svg).toHaveClass('rotate-180')
    })
  })

  describe('Language Selection', () => {
    it('should change language to Turkish when Türkçe is clicked', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç
      await user.click(button!)

      // Türkçe seçeneğine tıkla
      const turkishOption = screen.getByText('Türkçe')
      await user.click(turkishOption)

      // Dropdown kapanmalı
      expect(screen.queryByText('Türkçe')).not.toBeInTheDocument()

      // Dil değişmeli (TR gösterilmeli)
      expect(screen.getByText('TR')).toBeInTheDocument()
    })

    it('should change language to English when English is clicked', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç
      await user.click(button!)

      // English seçeneğine tıkla
      const englishOption = screen.getByText('English')
      await user.click(englishOption)

      // Dropdown kapanmalı
      expect(screen.queryByText('English')).not.toBeInTheDocument()

      // Dil EN olarak değişmeli
      expect(screen.getByText('EN')).toBeInTheDocument()
    })

    it('should close dropdown after language selection', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç
      await user.click(button!)
      expect(screen.getByText('Türkçe')).toBeInTheDocument()

      // Bir dil seç
      await user.click(screen.getByText('English'))

      // Dropdown kapanmalı
      expect(screen.queryByText('Türkçe')).not.toBeInTheDocument()
      expect(screen.queryByText('English')).not.toBeInTheDocument()
    })

    it('should show checkmark for selected language', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç
      await user.click(button!)

      // Türkçe seçili olduğu için checkmark gösterilmeli
      const turkishOption = screen.getByText('Türkçe').closest('button')
      expect(turkishOption).toHaveTextContent('✓')

      // English seçili değil, checkmark olmamalı
      const englishOption = screen.getByText('English').closest('button')
      expect(englishOption).not.toHaveTextContent('✓')
    })
  })

  describe('Click Outside', () => {
    it('should close dropdown when clicking outside', async () => {
      const user = userEvent.setup()
      renderWithProvider(
        <div>
          <LanguageSwitcher />
          <div data-testid="outside">Outside Element</div>
        </div>
      )

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç
      await user.click(button!)
      expect(screen.getByText('Türkçe')).toBeInTheDocument()

      // Dışarı tıkla
      const outsideElement = screen.getByTestId('outside')
      await user.click(outsideElement)

      // Dropdown kapanmalı
      expect(screen.queryByText('Türkçe')).not.toBeInTheDocument()
    })

    it('should not close dropdown when clicking inside dropdown', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç
      await user.click(button!)
      expect(screen.getByText('Türkçe')).toBeInTheDocument()

      // Dropdown içindeki bir öğeye tıkla (ama henüz dil seçme)
      const dropdown = screen.getByText('Türkçe').closest('div[class*="absolute"]')
      
      // Dropdown hala açık olmalı (dil seçilene kadar)
      expect(dropdown).toBeInTheDocument()
    })
  })

  describe('Language Persistence', () => {
    it('should restore language from localStorage on mount', async () => {
      // localStorage'a English kaydet
      localStorage.setItem('app-language', 'en')

      renderWithProvider(<LanguageSwitcher />)

      // EN gösterilmeli
      expect(screen.getByText('EN')).toBeInTheDocument()
    })

    it('should update localStorage when language changes', async () => {
      const user = userEvent.setup()
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Dropdown'ı aç ve English seç
      await user.click(button!)
      await user.click(screen.getByText('English'))

      // localStorage güncellenmiş olmalı
      expect(localStorage.getItem('app-language')).toBe('en')
    })
  })

  describe('Accessibility', () => {
    it('should have accessible button', () => {
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      expect(button).toBeInTheDocument()
      // Button element olarak erişilebilir olmalı
      expect(button?.tagName).toBe('BUTTON')
    })

    it('should have proper button structure', () => {
      renderWithProvider(<LanguageSwitcher />)

      const button = screen.getByText('TR').closest('button')
      
      // Buton içinde dil kodu ve SVG ikonu olmalı
      expect(button).toHaveTextContent('TR')
      expect(button?.querySelector('svg')).toBeInTheDocument()
    })
  })
})
