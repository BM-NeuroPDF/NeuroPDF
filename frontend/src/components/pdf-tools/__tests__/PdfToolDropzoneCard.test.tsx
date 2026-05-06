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
});
