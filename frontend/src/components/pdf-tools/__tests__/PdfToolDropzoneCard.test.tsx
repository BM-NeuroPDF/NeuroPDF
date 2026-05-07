import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PdfToolDropzoneCard from '@/components/pdf-tools/PdfToolDropzoneCard';

describe('PdfToolDropzoneCard', () => {
  it('renders file summary and remove action', () => {
    const onRemove = vi.fn();
    render(
      <PdfToolDropzoneCard
        getRootProps={() => ({})}
        getInputProps={() => ({})}
        isDragActive={false}
        files={[new File(['a'], 'doc.pdf', { type: 'application/pdf' })]}
        onRemove={onRemove}
        t={(key) => key}
      />,
    );

    expect(screen.getByText(/selectedFiles/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('uses active/passive labels and clear-all action', () => {
    const onClearAll = vi.fn();
    const { rerender } = render(
      <PdfToolDropzoneCard
        getRootProps={() => ({})}
        getInputProps={() => ({})}
        isDragActive
        files={[]}
        onClearAll={onClearAll}
        t={(key) => key}
      />,
    );
    expect(screen.getByText('dropActive')).toBeInTheDocument();

    const file = new File(['a'], 'doc.pdf', { type: 'application/pdf' });
    rerender(
      <PdfToolDropzoneCard
        getRootProps={() => ({})}
        getInputProps={() => ({})}
        isDragActive={false}
        files={[file]}
        onClearAll={onClearAll}
        currentFileHint="hint"
        t={(key) => key}
      />,
    );
    expect(screen.getByText('hint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clearAll' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
