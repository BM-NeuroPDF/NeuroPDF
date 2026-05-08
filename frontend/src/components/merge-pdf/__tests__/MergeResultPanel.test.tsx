import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MergeResultPanel from '@/components/merge-pdf/MergeResultPanel';

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    void loader();
    return function MockPdfViewer() {
      return <div data-testid="pdf-viewer">PdfViewer</div>;
    };
  },
}));

describe('MergeResultPanel', () => {
  it('renders viewer, translated title and action buttons', () => {
    render(
      <MergeResultPanel
        blob={new Blob(['pdf'], { type: 'application/pdf' })}
        handleDownload={vi.fn()}
        handleSave={vi.fn()}
        clearFiles={vi.fn()}
        saving={false}
        session={{ user: { email: 'x@y.com' } } as never}
        t={(key) => `tr:${key}` as never}
      />,
    );

    expect(screen.getByText('tr:mergedPdfPreview')).toBeInTheDocument();
    expect(screen.getByText('tr:mergeSuccessTitle')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tr:download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tr:save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tr:newProcess' })).toBeInTheDocument();
  });

  it('calls onDownload and onSave when buttons are clicked', () => {
    const handleDownload = vi.fn();
    const handleSave = vi.fn();

    render(
      <MergeResultPanel
        blob={new Blob(['pdf'], { type: 'application/pdf' })}
        handleDownload={handleDownload}
        handleSave={handleSave}
        clearFiles={vi.fn()}
        saving={false}
        session={{ user: { email: 'x@y.com' } } as never}
        t={(key) => key}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'download' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(handleDownload).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledTimes(1);
  });

  it('uses translation prop and hides save button for guests', () => {
    render(
      <MergeResultPanel
        blob={new Blob(['pdf'], { type: 'application/pdf' })}
        handleDownload={vi.fn()}
        handleSave={vi.fn()}
        clearFiles={vi.fn()}
        saving={false}
        session={null}
        t={(key) => `i18n:${key}` as never}
      />,
    );

    expect(screen.getByRole('button', { name: 'i18n:download' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'i18n:save' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'i18n:loginWarning' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
