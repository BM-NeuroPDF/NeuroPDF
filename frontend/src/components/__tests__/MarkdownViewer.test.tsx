import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MarkdownViewer from '../MarkdownViewer';

vi.mock('@/services/pdfService', () => ({
  pdfService: {
    createPdfFromMarkdown: vi.fn(),
  },
}));

import { pdfService } from '@/services/pdfService';

describe('MarkdownViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no markdown', () => {
    render(<MarkdownViewer markdown="" />);
    expect(screen.getByText(/Özet henüz hazır değil/i)).toBeInTheDocument();
  });

  it('renders markdown and normalizes bullets', () => {
    const md = '•   Item one\n1.    Numbered';
    render(<MarkdownViewer markdown={md} height={200} />);
    expect(
      screen.getByRole('button', { name: /PDF indir/i })
    ).toBeInTheDocument();
  });

  it('handles PDF download success and error', async () => {
    const createPdf = pdfService.createPdfFromMarkdown as ReturnType<
      typeof vi.fn
    >;
    createPdf.mockResolvedValueOnce(undefined);
    render(<MarkdownViewer markdown="Hello" defaultPdfName="out.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF indir/i }));
    await waitFor(() => expect(createPdf).toHaveBeenCalled());

    createPdf.mockRejectedValueOnce(new Error('fail'));
    fireEvent.click(screen.getByRole('button', { name: /PDF indir/i }));
    await waitFor(() =>
      expect(screen.getByText(/PDF oluşturulamadı/i)).toBeInTheDocument()
    );
  });
});
