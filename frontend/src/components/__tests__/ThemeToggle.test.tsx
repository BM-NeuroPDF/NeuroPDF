import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
  },
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it('hydrates and toggles theme on click', async () => {
    render(<ThemeToggle />);
    const toggle = await waitFor(() => document.querySelector('.cursor-pointer'));
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle as HTMLElement);
    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    fireEvent.click(toggle as HTMLElement);
    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('light');
    });
  });
});
