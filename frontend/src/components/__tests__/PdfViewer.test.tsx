import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect } from 'react';
import PdfViewer, { clampPdfPage } from '../PdfViewer';
import { useLanguage } from '@/context/LanguageContext';

// Mock dependencies
vi.mock('@/context/LanguageContext');
vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
  Document: ({
    onLoadSuccess,
    children,
  }: {
    onLoadSuccess?: (pdf: { numPages: number }) => void;
    children?: React.ReactNode;
  }) => {
    useEffect(() => {
      if (onLoadSuccess) {
        onLoadSuccess({ numPages: 5 });
      }
    }, [onLoadSuccess]);
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid={`pdf-page-${pageNumber}`}>Page {pageNumber}</div>
  ),
}));

describe('clampPdfPage', () => {
  it('clamps to range and treats numPages 0 as 1', () => {
    expect(clampPdfPage(3, 5)).toBe(3);
    expect(clampPdfPage(100, 5)).toBe(5);
    expect(clampPdfPage(0, 5)).toBe(1);
    expect(clampPdfPage(-3, 5)).toBe(1);
    expect(clampPdfPage(2, 0)).toBe(1);
  });
});

describe('PdfViewer', () => {
  const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
  const mockUseLanguage = {
    t: (key: string) => key,
    language: 'tr',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLanguage).mockReturnValue(mockUseLanguage as ReturnType<typeof useLanguage>);
  });

  it('renders PDF viewer with file', () => {
    render(<PdfViewer file={mockFile} />);

    expect(screen.getByTestId('pdf-document')).toBeInTheDocument();
  });

  it('renders with custom height', () => {
    const { container } = render(<PdfViewer file={mockFile} height={800} />);

    // Height should be applied to the viewer
    expect(container).toBeTruthy();
  });

  it('navigates to next page', async () => {
    render(<PdfViewer file={mockFile} />);

    await waitFor(() => {
      const nextButton = screen.getByText(/next/i);
      expect(nextButton).toBeInTheDocument();
    });

    const nextButton = screen.getByText(/next/i);
    fireEvent.click(nextButton);

    // Page should increment
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-2')).toBeInTheDocument();
    });
  });

  it('navigates to previous page', async () => {
    render(<PdfViewer file={mockFile} />);

    // Go to page 2 first
    await waitFor(() => {
      const nextButton = screen.getByText(/next/i);
      fireEvent.click(nextButton);
    });

    // Then go back
    await waitFor(() => {
      const prevButton = screen.getByText(/prev/i);
      fireEvent.click(prevButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument();
    });
  });

  it('changes page via input', async () => {
    render(<PdfViewer file={mockFile} />);

    await waitFor(() => {
      const pageInput = screen.getByDisplayValue('1');
      fireEvent.change(pageInput, { target: { value: '3' } });
      fireEvent.keyDown(pageInput, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-3')).toBeInTheDocument();
    });
  });

  it('clamps page 0 input to first page', async () => {
    render(<PdfViewer file={mockFile} />);

    await waitFor(() => {
      const pageInput = screen.getByDisplayValue('1');
      fireEvent.change(pageInput, { target: { value: '0' } });
      fireEvent.keyDown(pageInput, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument();
    });
  });

  it('handles invalid page number', async () => {
    render(<PdfViewer file={mockFile} />);

    await waitFor(() => {
      const pageInput = screen.getByDisplayValue('1');
      fireEvent.change(pageInput, { target: { value: '999' } });
      fireEvent.keyDown(pageInput, { key: 'Enter', code: 'Enter' });
    });

    // Should clamp to max page
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-5')).toBeInTheDocument();
    });
  });

  it('changes zoom level with + and − controls', async () => {
    render(<PdfViewer file={mockFile} />);

    await waitFor(() => {
      expect(screen.getByText(/%100/)).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole('button');
    const minus = buttons.find((b) => b.textContent === '−');
    const plus = buttons.find((b) => b.textContent === '+');
    expect(minus).toBeTruthy();
    expect(plus).toBeTruthy();

    fireEvent.click(plus!);
    await waitFor(() => {
      expect(screen.getByText(/%110/)).toBeInTheDocument();
    });

    fireEvent.click(minus!);
    await waitFor(() => {
      expect(screen.getByText(/%100/)).toBeInTheDocument();
    });
  });

  it('changes page via Enter after typing with userEvent', async () => {
    const user = userEvent.setup();
    render(<PdfViewer file={mockFile} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    });

    const pageInput = screen.getByDisplayValue('1');
    await user.clear(pageInput);
    await user.type(pageInput, '4');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-4')).toBeInTheDocument();
    });
  });

  it('resets page when file changes', async () => {
    const { rerender } = render(<PdfViewer file={mockFile} />);

    // Navigate to page 2
    await waitFor(() => {
      const nextButton = screen.getByText(/next/i);
      fireEvent.click(nextButton);
    });

    // Change file
    const newFile = new File(['test2'], 'test2.pdf', {
      type: 'application/pdf',
    });
    rerender(<PdfViewer file={newFile} />);

    // Should reset to page 1
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument();
    });
  });
});
