import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditPdfToolbar from '../EditPdfToolbar';

const t = (k: string) => k;

describe('EditPdfToolbar', () => {
  it('renders process actions when preview is active', async () => {
    const onProcess = vi.fn();
    const user = userEvent.setup();
    render(
      <EditPdfToolbar
        objectUrl="blob:x"
        isProcessingDone={false}
        processedBlob={null}
        pagesLength={2}
        session={null}
        saving={false}
        onProcessAndDownload={onProcess}
        onReset={vi.fn()}
        onDownload={vi.fn()}
        onSave={vi.fn()}
        t={t}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'processAndDownload' }));
    expect(onProcess).toHaveBeenCalled();
  });

  it('renders success actions when processing is done', async () => {
    const onDownload = vi.fn();
    const user = userEvent.setup();
    const blob = new Blob(['x'], { type: 'application/pdf' });
    render(
      <EditPdfToolbar
        objectUrl="blob:x"
        isProcessingDone
        processedBlob={blob}
        pagesLength={1}
        session={null}
        saving={false}
        onProcessAndDownload={vi.fn()}
        onReset={vi.fn()}
        onDownload={onDownload}
        onSave={vi.fn()}
        t={t}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'download' }));
    expect(onDownload).toHaveBeenCalled();
  });
});
