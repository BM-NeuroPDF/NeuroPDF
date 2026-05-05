import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditPdfDialogs from '../EditPdfDialogs';

vi.mock('@/components/UsageLimitModal', () => ({
  default: ({ isOpen, usageCount }: { isOpen: boolean; usageCount?: number }) =>
    isOpen ? <div data-testid="limit-modal">limit-{usageCount ?? 'na'}</div> : null,
}));

vi.mock('@/components/ui/Popup', () => ({
  default: ({ open, message }: { open: boolean; message: string }) =>
    open ? <div data-testid="popup">{message}</div> : null,
}));

describe('EditPdfDialogs', () => {
  it('shows limit modal when open', () => {
    render(
      <EditPdfDialogs
        showLimitModal
        onCloseLimitModal={vi.fn()}
        onLogin={vi.fn()}
        usageInfo={{
          can_use: false,
          usage_count: 3,
          remaining_usage: 0,
          message: 'max',
        }}
        popup={{ open: false, type: 'info', message: '' }}
        onClosePopup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('limit-modal')).toHaveTextContent('limit-3');
  });

  it('shows popup when open', () => {
    render(
      <EditPdfDialogs
        showLimitModal={false}
        onCloseLimitModal={vi.fn()}
        onLogin={vi.fn()}
        usageInfo={null}
        popup={{ open: true, type: 'error', message: 'oops' }}
        onClosePopup={vi.fn()}
      />,
    );
    expect(screen.getByTestId('popup')).toHaveTextContent('oops');
  });
});
