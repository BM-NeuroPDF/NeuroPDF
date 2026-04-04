import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { useUnifiedPdfDrop } from '../useUnifiedPdfDrop';

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
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      rootProps = getRootProps();
      return <div data-testid="drop" {...rootProps} />;
    }
    render(<Probe />);
    const dt = {
      types: ['application/x-neuro-pdf'],
      getData: () => '',
      dropEffect: 'none' as string,
    };
    (rootProps as any).onDragOverCapture?.({
      dataTransfer: dt,
      preventDefault: vi.fn(),
    });
    expect(dt.dropEffect).toBe('copy');
  });

  it('falls back to pdfFile when neuro payload JSON is invalid', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);
    (rootProps as any).onDropCapture?.({
      dataTransfer: {
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf' ? 'not-json{' : '',
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onFiles).toHaveBeenCalledWith([panelFile], []);
  });

  it('forwards panel file on custom drop capture', () => {
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    (rootProps as any).onDropCapture?.({
      dataTransfer: {
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf'
            ? JSON.stringify({ name: 'panel.pdf' })
            : '',
      },
      preventDefault,
      stopPropagation,
    });
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
    let rootProps: ReturnType<
      ReturnType<typeof useUnifiedPdfDrop>['getRootProps']
    >;
    function Probe() {
      const { getRootProps } = useUnifiedPdfDrop({
        options: { multiple: false, accept: { 'application/pdf': ['.pdf'] } },
        onFiles,
      });
      rootProps = getRootProps();
      return <div {...rootProps} />;
    }
    render(<Probe />);
    expect(() =>
      (rootProps as any).onDropCapture?.({
        dataTransfer: { getData: () => '' },
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      })
    ).not.toThrow();
  });
});
