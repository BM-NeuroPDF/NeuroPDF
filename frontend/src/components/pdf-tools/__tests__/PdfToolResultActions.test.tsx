import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PdfToolResultActions from '@/components/pdf-tools/PdfToolResultActions';

describe('PdfToolResultActions', () => {
  it('renders actions and triggers callbacks', () => {
    const onDownload = vi.fn();
    const onSave = vi.fn();
    const onReset = vi.fn();
    render(
      <PdfToolResultActions
        onDownload={onDownload}
        onSave={onSave}
        onReset={onReset}
        saving={false}
        session={{ user: { email: 'x@y.com' } } as never}
        t={(key) => key}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'download' }));
    fireEvent.click(screen.getByRole('button', { name: 'saveToFiles' }));
    fireEvent.click(screen.getByRole('button', { name: 'newProcess' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('hides save action for guests and shows login warning', () => {
    render(
      <PdfToolResultActions
        onDownload={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        saving={false}
        session={null}
        t={(key) => key}
      />,
    );
    expect(screen.queryByRole('button', { name: 'saveToFiles' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'loginWarning' })).toHaveAttribute('href', '/login');
  });

  it('renders saving label and supports custom save key', () => {
    const { rerender } = render(
      <PdfToolResultActions
        onDownload={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        saving
        session={{ user: { email: 'x@y.com' } } as never}
        t={(key) => key}
      />,
    );
    expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled();

    rerender(
      <PdfToolResultActions
        onDownload={vi.fn()}
        onSave={vi.fn()}
        onReset={vi.fn()}
        saving={false}
        session={{ user: { email: 'x@y.com' } } as never}
        saveLabelKey="save"
        t={(key) => key}
      />,
    );
    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument();
  });
});
