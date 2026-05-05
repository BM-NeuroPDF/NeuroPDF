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

import { SummaryResultPanel } from '../SummaryResultPanel';

describe('SummaryResultPanel dynamic loading fallback', () => {
  it('renders loading fallback from dynamic markdown loader', () => {
    render(
      <SummaryResultPanel
        summary="x"
        file={null}
        userRole={null}
        onNew={vi.fn()}
        onDownloadPdf={vi.fn()}
        onStartChat={undefined}
        onRequestAudio={undefined}
        audioUrl={null}
        audioLoading={false}
        audioPlayer={null}
        t={(k) => k}
      />,
    );

    expect(screen.getByTestId('dynamic-loader-wrapper')).toBeInTheDocument();
    expect(screen.getByText('summaryResultTitle')).toBeInTheDocument();
  });
});
