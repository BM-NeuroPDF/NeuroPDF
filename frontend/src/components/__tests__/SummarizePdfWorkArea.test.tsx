import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummarizePdfWorkArea } from '../SummarizePdfWorkArea';

vi.mock('@/components/PdfViewer', () => ({
  default: function MockPdfViewer({ file }: { file: File }) {
    return <div data-testid="pdf-viewer-mock">{file.name}</div>;
  },
}));

const t = (k: string) => k;

const pdf = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });

describe('SummarizePdfWorkArea', () => {
  it('renders preview title and pdf viewer', () => {
    render(
      <SummarizePdfWorkArea
        file={pdf}
        summarizing={false}
        onSummarize={vi.fn()}
        t={t as ComponentProps<typeof SummarizePdfWorkArea>['t']}
      />
    );
    expect(screen.getByText('pdfPreviewTitle')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-mock')).toHaveTextContent('test.pdf');
  });

  it('calls onSummarize when button clicked', () => {
    const onSummarize = vi.fn();
    render(
      <SummarizePdfWorkArea
        file={pdf}
        summarizing={false}
        onSummarize={onSummarize}
        t={t as ComponentProps<typeof SummarizePdfWorkArea>['t']}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /summarizeButton/i }));
    expect(onSummarize).toHaveBeenCalled();
  });

  it('disables summarize button while summarizing', () => {
    render(
      <SummarizePdfWorkArea
        file={pdf}
        summarizing
        onSummarize={vi.fn()}
        t={t as ComponentProps<typeof SummarizePdfWorkArea>['t']}
      />
    );
    expect(
      screen.getByRole('button', { name: /summarizeButton/i })
    ).toBeDisabled();
  });

  it('uses summarize button fallback label when t returns empty', () => {
    const tEmpty = (() => '') as ComponentProps<
      typeof SummarizePdfWorkArea
    >['t'];
    render(
      <SummarizePdfWorkArea
        file={pdf}
        summarizing={false}
        onSummarize={vi.fn()}
        t={tEmpty}
      />
    );
    expect(screen.getByRole('button', { name: /Özetle/i })).toBeInTheDocument();
  });
});
