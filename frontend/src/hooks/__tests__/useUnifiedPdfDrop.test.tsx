import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { useUnifiedPdfDrop } from '../useUnifiedPdfDrop';

type UnifiedRootProps = ReturnType<
  ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
>;

const panelFile = new File(['%PDF'], 'panel.pdf', { type: 'application/pdf' });

vi.mock('@/context/PdfContext', () => ({
  usePdf: () => ({
    pdfFile: panelFile,
    pdfList: [panelFile],
  }),
}));

describe('useUnifiedPdfDrop', () => {
  const onFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets dropEffect to copy for neuro mime on drag over capture', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      captured.root = getRootProps();
      return <div data-testid="drop" {...captured.root!} />;
    }
    render(<Probe />);
    const dt = {
      types: ['application/x-neuro-pdf'],
      getData: () => '',
      dropEffect: 'none' as string,
    };
    captured.root?.onDragOverCapture?.({
      dataTransfer: dt,
      preventDefault: vi.fn(),
    } as unknown as React.DragEvent<HTMLDivElement>);
    expect(dt.dropEffect).toBe('copy');
  });

  it('falls back to pdfFile when neuro payload JSON is invalid', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);
    captured.root?.onDropCapture?.({
      dataTransfer: {
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf' ? 'not-json{' : '',
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.DragEvent<HTMLDivElement>);
    expect(onFiles).toHaveBeenCalledWith([panelFile], []);
  });

  it('forwards panel file on custom drop capture', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    captured.root?.onDropCapture?.({
      dataTransfer: {
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf'
            ? JSON.stringify({ name: 'panel.pdf' })
            : '',
      },
      preventDefault,
      stopPropagation,
    } as unknown as React.DragEvent<HTMLDivElement>);
    expect(onFiles).toHaveBeenCalledWith([panelFile], []);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('invokes onFiles when file is selected via input', async () => {
    const user = userEvent.setup();
    const pdf = new File(['%PDF'], 'pick.pdf', { type: 'application/pdf' });
    function Probe() {
      const { getRootProps, getInputProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      return (
        <div {...getRootProps()}>
          <input {...getInputProps()} data-testid="inp" />
        </div>
      );
    }
    render(<Probe />);
    const input = document.querySelector(
      '[data-testid="inp"]'
    ) as HTMLInputElement;
    await user.upload(input, pdf);
    expect(onFiles).toHaveBeenCalled();
  });

  it('delegates to base onDropCapture when no neuro payload', () => {
    const captured: { root?: UnifiedRootProps } = {};
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      captured.root = getRootProps();
      return <div {...captured.root!} />;
    }
    render(<Probe />);
    expect(() =>
      captured.root?.onDropCapture?.({
        dataTransfer: { getData: () => '' },
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.DragEvent<HTMLDivElement>)
    ).not.toThrow();
  });
});
