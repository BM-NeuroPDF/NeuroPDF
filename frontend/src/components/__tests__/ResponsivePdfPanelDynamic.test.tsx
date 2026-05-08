import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

type DynamicOpts = {
  ssr?: boolean;
  loading?: () => unknown;
};

const captured = vi.hoisted(() => ({
  lastOpts: undefined as DynamicOpts | undefined,
}));

vi.mock('next/dynamic', () => ({
  default: (importFn: () => Promise<unknown>, opts?: DynamicOpts) => {
    captured.lastOpts = opts;
    void importFn();
    function MockPanel() {
      return <div data-testid="responsive-pdf-panel">panel</div>;
    }
    MockPanel.displayName = 'MockResponsivePdfPanel';
    return MockPanel;
  },
}));

describe('ResponsivePdfPanelDynamic', () => {
  beforeEach(() => {
    captured.lastOpts = undefined;
  });

  it('renders via next/dynamic with ssr disabled and null loading shell', async () => {
    const { default: ResponsivePdfPanelDynamic } =
      await import('@/components/ResponsivePdfPanelDynamic');

    render(<ResponsivePdfPanelDynamic />);

    expect(screen.getByTestId('responsive-pdf-panel')).toBeInTheDocument();

    expect(captured.lastOpts).toMatchObject({ ssr: false });
    expect(captured.lastOpts?.loading).toEqual(expect.any(Function));
    expect(captured.lastOpts?.loading?.()).toBeNull();
  });
});
