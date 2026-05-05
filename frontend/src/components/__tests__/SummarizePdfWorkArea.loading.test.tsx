import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { JSX } from 'react';

vi.mock('next/dynamic', () => ({
  default: (importer: () => Promise<unknown>, opts?: { loading?: () => JSX.Element }) => {
    void importer();
    const DynamicMock = () => (
      <div data-testid="dynamic-loader-wrapper">{opts?.loading ? opts.loading() : null}</div>
    );
    return DynamicMock;
  },
}));

import { SummarizePdfWorkArea } from '../SummarizePdfWorkArea';

describe('SummarizePdfWorkArea dynamic loading fallback', () => {
  it('renders loading fallback from next/dynamic config', () => {
    const pdf = new File(['%PDF'], 'loader.pdf', { type: 'application/pdf' });
    render(
      <SummarizePdfWorkArea file={pdf} summarizing={false} onSummarize={vi.fn()} t={(k) => k} />,
    );

    expect(screen.getByTestId('dynamic-loader-wrapper')).toBeInTheDocument();
    expect(screen.getByText('pdfPreviewTitle')).toBeInTheDocument();
  });
});
