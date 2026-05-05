import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { useSensors, useSensor, PointerSensor } from '@dnd-kit/core';
import EditPdfCanvas from '../EditPdfCanvas';

vi.mock('../EditPdfDocument', () => ({
  EditPdfDocument: ({
    children,
    onLoadSuccess,
  }: {
    children: React.ReactNode;
    onLoadSuccess: (a: { numPages: number }) => void;
  }) => {
    onLoadSuccess({ numPages: 1 });
    return <div data-testid="mock-doc">{children}</div>;
  },
}));

vi.mock('../EditPdfSortablePageItem', () => ({
  EditPdfSortablePageItem: () => <div data-testid="page-item" />,
}));

const t = (k: string) => k;

function SensorsProbe(props: Omit<ComponentProps<typeof EditPdfCanvas>, 'sensors'>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  return <EditPdfCanvas {...props} sensors={sensors} />;
}

describe('EditPdfCanvas', () => {
  it('renders document and preview title when objectUrl is set', () => {
    render(
      <SensorsProbe
        objectUrl="blob:test"
        isProcessingDone={false}
        pages={[{ id: 'page-1', pageNumber: 1 }]}
        onDragEnd={vi.fn()}
        onLoadSuccess={vi.fn()}
        pdfOptions={{ cMapUrl: '/cmaps/', cMapPacked: true }}
        t={t}
      />,
    );
    expect(screen.getByTestId('mock-doc')).toBeInTheDocument();
    expect(screen.getByText(/previewDragDrop/)).toBeInTheDocument();
  });

  it('returns null when processing is done', () => {
    const { container } = render(
      <SensorsProbe
        objectUrl="blob:test"
        isProcessingDone
        pages={[]}
        onDragEnd={vi.fn()}
        onLoadSuccess={vi.fn()}
        pdfOptions={{ cMapUrl: '/cmaps/', cMapPacked: true }}
        t={t}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
