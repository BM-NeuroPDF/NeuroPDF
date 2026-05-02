import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps, DragEvent } from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { SummarizeDropzone } from '../SummarizeDropzone';

const t = (k: string) => k;

function dataTransferStub(
  overrides: {
    getData?: (fmt: string) => string;
    types?: string[];
  } = {}
) {
  const types = overrides.types ?? ['Files'];
  return {
    types,
    files: Object.assign([], { length: 0, item: () => null }) as FileList,
    getData: overrides.getData ?? (() => ''),
  };
}

/** Shape expected by react-dropzone / file-selector for dragenter (see react-dropzone index.spec createDtWithFiles). */
function dragEnterDataTransferForFiles(files: File[]) {
  return {
    files,
    items: files.map((file) => ({
      kind: 'file' as const,
      size: file.size,
      type: file.type,
      getAsFile: () => file,
    })),
    types: ['Files'],
  };
}

function setup(
  overrides: Partial<ComponentProps<typeof SummarizeDropzone>> = {}
) {
  const onDrop = vi.fn();
  const onFileInputChange = vi.fn();
  const onPanelDrop = vi.fn((e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
  });
  const props = {
    maxBytes: 5 * 1024 * 1024,
    t: t as ComponentProps<typeof SummarizeDropzone>['t'],
    file: null as File | null,
    onDrop,
    onFileInputChange,
    onPanelDrop,
    ...overrides,
  };
  const { container } = render(<SummarizeDropzone {...props} />);
  const dropZone = container.querySelector('.container-card.border-dashed');
  const manualFileInput = container.querySelectorAll(
    'input[type="file"]'
  )[1] as HTMLInputElement;
  return {
    container,
    dropZone,
    manualFileInput,
    onDrop,
    onFileInputChange,
    onPanelDrop,
    props,
  };
}

describe('SummarizeDropzone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders passive drop hint', () => {
    setup();
    expect(screen.getByText('dropPassive')).toBeInTheDocument();
  });

  it('shows selected file name when file is set', () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    setup({ file });
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    expect(screen.getByText(/currentFile/)).toBeInTheDocument();
  });

  it('shows active drop hint and drag styling while dragging files over zone', async () => {
    const { dropZone } = setup();
    const pdf = new File(['%PDF'], 'drag.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.dragEnter(dropZone!, {
        dataTransfer: dragEnterDataTransferForFiles([pdf]),
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('dropActive')).toBeInTheDocument();
    });
    expect(dropZone?.className).toContain('border-[var(--button-bg)]');
  });

  it('hides current file hint while drag is active', async () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    const { dropZone } = setup({ file });
    expect(screen.getByText(/changeFileHint/)).toBeInTheDocument();
    const pdf = new File(['%PDF'], 'other.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.dragEnter(dropZone!, {
        dataTransfer: dragEnterDataTransferForFiles([pdf]),
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText(/changeFileHint/)).not.toBeInTheDocument();
    });
  });

  it('calls onPanelDrop when panel drag MIME is present', () => {
    const { dropZone, onPanelDrop } = setup();
    expect(dropZone).toBeTruthy();
    fireEvent.drop(dropZone!, {
      dataTransfer: dataTransferStub({
        getData: (fmt: string) =>
          fmt === 'application/x-neuro-pdf' ? '1' : '',
      }),
    });
    expect(onPanelDrop).toHaveBeenCalledTimes(1);
  });

  it('does not call onPanelDrop when panel flag is absent', async () => {
    const { dropZone, onPanelDrop } = setup();
    await act(async () => {
      fireEvent.drop(dropZone!, {
        dataTransfer: dataTransferStub({ getData: () => '' }),
      });
    });
    expect(onPanelDrop).not.toHaveBeenCalled();
  });

  it('forwards manual file input change', () => {
    const { manualFileInput, onFileInputChange } = setup();
    const f = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    fireEvent.change(manualFileInput, { target: { files: [f] } });
    expect(onFileInputChange).toHaveBeenCalled();
  });

  it('disables manual file input when disabled', () => {
    const { manualFileInput } = setup({ disabled: true });
    expect(manualFileInput.disabled).toBe(true);
  });

  it('applies disabled styling to label', () => {
    const { container } = setup({ disabled: true });
    const label = container.querySelector('label');
    expect(label?.className).toContain('pointer-events-none');
    expect(label?.className).toContain('opacity-50');
  });
});
