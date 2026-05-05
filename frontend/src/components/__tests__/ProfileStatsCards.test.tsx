import { describe, it, expect } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { ProfileStatsCards } from '../ProfileStatsCards';

const t = (k: string) => k;

const stats = {
  summary_count: 3,
  tools_count: 7,
  role: 'Gold',
};

describe('ProfileStatsCards', () => {
  it('renders user plan and counts', () => {
    render(
      <ProfileStatsCards
        stats={stats}
        userPlan="Premium"
        t={t as ComponentProps<typeof ProfileStatsCards>['t']}
      />,
    );
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(screen.getByText('membershipType')).toBeInTheDocument();
    expect(screen.getByText('aiSummary')).toBeInTheDocument();
    expect(screen.getByText('pdfTools')).toBeInTheDocument();
  });

  it('uses Turkish fallbacks when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<typeof ProfileStatsCards>['t'];
    render(<ProfileStatsCards stats={stats} userPlan="X" t={tEmpty} />);
    expect(screen.getByText('Üyelik Tipi')).toBeInTheDocument();
    expect(screen.getByText('AI Özetleme')).toBeInTheDocument();
    expect(screen.getByText('PDF Araçları')).toBeInTheDocument();
    const countRows = screen
      .getAllByText((_, el) => !!el?.classList?.contains('text-lg'))
      .filter((el) => el.textContent?.includes('İşlem'));
    expect(countRows.length).toBe(2);
  });
});
