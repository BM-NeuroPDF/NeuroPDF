import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const baseOnDragOverCapture = vi.fn();
const baseOnDropCapture = vi.fn();

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({
      onDragOverCapture: baseOnDragOverCapture,
      onDropCapture: baseOnDropCapture,
    }),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock('@/context/PdfContext', () => ({
  usePdfData: () => ({
    pdfFile: null,
    pdfList: [] as File[],
  }),
}));

import { useUnifiedPdfDrop } from '../useUnifiedPdfDrop';

type UnifiedRootProps = ReturnType<ReturnType<typeof useUnifiedPdfDrop>['getRootProps']>;

describe('useUnifiedPdfDrop branch coverage (mocked dropzone)', () => {
  const onFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls base onDragOverCapture and survives types access throwing', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);

    const e = {
      preventDefault: vi.fn(),
      dataTransfer: {
        get types() {
          throw new Error('types boom');
        },
      },
    } as unknown as React.DragEvent<HTMLDivElement>;

    expect(() => captured.root?.onDragOverCapture?.(e)).not.toThrow();
    expect(baseOnDragOverCapture).toHaveBeenCalled();
  });

  it('falls back to base onDropCapture when getData throws', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);

    const e = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        getData: () => {
          throw new Error('getData boom');
        },
      },
    } as unknown as React.DragEvent<HTMLDivElement>;

    captured.root?.onDropCapture?.(e);
    expect(baseOnDropCapture).toHaveBeenCalledWith(e);
  });

  it('falls back to base onDropCapture when panel flag set but no pdf to forward', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);

    const e = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf' ? JSON.stringify({ name: 'missing.pdf' }) : '',
      },
    } as unknown as React.DragEvent<HTMLDivElement>;

    captured.root?.onDropCapture?.(e);
    expect(onFiles).not.toHaveBeenCalled();
    expect(baseOnDropCapture).toHaveBeenCalled();
  });

  it('onDragOverCapture tolerates missing dataTransfer', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);
    captured.root?.onDragOverCapture?.({
      preventDefault: vi.fn(),
      dataTransfer: undefined,
    } as unknown as React.DragEvent<HTMLDivElement>);
    expect(baseOnDragOverCapture).toHaveBeenCalled();
  });

  it('invokes base onDragOverCapture before preventDefault when present', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);

    const dt = {
      types: ['application/x-neuro-pdf'],
      dropEffect: 'none' as string,
    };
    captured.root?.onDragOverCapture?.({
      dataTransfer: dt,
      preventDefault: vi.fn(),
    } as unknown as React.DragEvent<HTMLDivElement>);
    expect(baseOnDragOverCapture).toHaveBeenCalled();
    expect(dt.dropEffect).toBe('copy');
  });
});
