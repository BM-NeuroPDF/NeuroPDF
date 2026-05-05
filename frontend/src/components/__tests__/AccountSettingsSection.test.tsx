import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountSettingsSection } from '../AccountSettingsSection';

const t = (k: string) => k;

describe('AccountSettingsSection', () => {
  it('calls onRequestDelete when delete is clicked', () => {
    const onRequestDelete = vi.fn();
    render(
      <AccountSettingsSection
        onRequestDelete={onRequestDelete}
        t={t as ComponentProps<typeof AccountSettingsSection>['t']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /deleteAccount/i }));
    expect(onRequestDelete).toHaveBeenCalled();
  });

  it('disables coming soon actions', () => {
    render(
      <AccountSettingsSection
        onRequestDelete={vi.fn()}
        t={t as ComponentProps<typeof AccountSettingsSection>['t']}
      />,
    );
    const disabled = screen
      .getAllByRole('button', { hidden: false })
      .filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.length).toBe(2);
  });

  it('uses Turkish fallbacks when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof AccountSettingsSection>['t'];
    render(<AccountSettingsSection onRequestDelete={vi.fn()} t={tEmpty} />);
    expect(screen.getByText('Hesap Ayarları')).toBeInTheDocument();
    expect(screen.getByText(/Google.*ayarlarını kullanmanız/i)).toBeInTheDocument();
    expect(screen.getByText('E-posta Değiştir')).toBeInTheDocument();
    expect(screen.getByText('Verilerimi İndir')).toBeInTheDocument();
    expect(screen.getAllByText('Yakında').length).toBe(2);
    expect(screen.getByRole('button', { name: /Hesabımı Sil/i })).toBeInTheDocument();
  });
});
