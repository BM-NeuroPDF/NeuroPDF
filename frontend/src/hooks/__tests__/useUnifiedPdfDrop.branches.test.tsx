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
  usePdf: () => ({
    pdfFile: null,
    pdfList: [] as File[],
  }),
}));

import { useUnifiedPdfDrop } from '../useUnifiedPdfDrop';

describe('useUnifiedPdfDrop branch coverage (mocked dropzone)', () => {
  const onFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls base onDragOverCapture and survives types access throwing', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);

    const e = {
      preventDefault: vi.fn(),
      dataTransfer: {
        get types() {
          throw new Error('types boom');
        },
      },
    } as any;

    expect(() => (rootProps as any).onDragOverCapture?.(e)).not.toThrow();
    expect(baseOnDragOverCapture).toHaveBeenCalled();
  });

  it('falls back to base onDropCapture when getData throws', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
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
    } as any;

    (rootProps as any).onDropCapture?.(e);
    expect(baseOnDropCapture).toHaveBeenCalledWith(e);
  });

  it('falls back to base onDropCapture when panel flag set but no pdf to forward', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);

    const e = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf'
            ? JSON.stringify({ name: 'missing.pdf' })
            : '',
      },
    } as unknown as React.DragEvent;

    (rootProps as any).onDropCapture?.(e);
    expect(onFiles).not.toHaveBeenCalled();
    expect(baseOnDropCapture).toHaveBeenCalled();
  });

  it('onDragOverCapture tolerates missing dataTransfer', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);
    (rootProps as any).onDragOverCapture?.({
      preventDefault: vi.fn(),
      dataTransfer: undefined,
    });
    expect(baseOnDragOverCapture).toHaveBeenCalled();
  });

  it('invokes base onDragOverCapture before preventDefault when present', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: {},
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);

    const dt = {
      types: ['application/x-neuro-pdf'],
      dropEffect: 'none' as string,
    };
    (rootProps as any).onDragOverCapture?.({
      dataTransfer: dt,
      preventDefault: vi.fn(),
    });
    expect(baseOnDragOverCapture).toHaveBeenCalled();
    expect(dt.dropEffect).toBe('copy');
  });
});
