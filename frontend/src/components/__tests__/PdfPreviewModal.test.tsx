import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PdfPreviewModal from '../PdfPreviewModal';

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../PdfViewer', () => ({
  default: function MockPdfViewer({ file, height }: { file: unknown; height?: string }) {
    const label =
      typeof file === 'string' ? file : file instanceof Blob ? `blob:${file.size}` : 'no-file';
    return (
      <div data-testid="pdf-viewer" data-height={height}>
        {label}
      </div>
    );
  },
}));

describe('PdfPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <PdfPreviewModal
        isOpen={false}
        onClose={vi.fn()}
        file={new Blob(['%PDF'], { type: 'application/pdf' })}
        title="T"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when file is null', () => {
    const { container } = render(
      <PdfPreviewModal isOpen onClose={vi.fn()} file={null} title="T" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and PdfViewer when open with a File', () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    render(<PdfPreviewModal isOpen onClose={vi.fn()} file={file} title="Önizleme" />);

    expect(screen.getByRole('heading', { name: 'Önizleme' })).toBeInTheDocument();
    const viewer = screen.getByTestId('pdf-viewer');
    expect(viewer).toHaveAttribute('data-height', '100%');
    expect(viewer.textContent).toContain('blob:');
  });

  it('renders when file is a URL string', () => {
    render(
      <PdfPreviewModal isOpen onClose={vi.fn()} file="https://example.com/x.pdf" title="Remote" />,
    );
    expect(screen.getByTestId('pdf-viewer')).toHaveTextContent('https://example.com/x.pdf');
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const file = new Blob(['x'], { type: 'application/pdf' });
    render(<PdfPreviewModal isOpen onClose={onClose} file={file} title="T" />);

    const backdrop = document.querySelector('.bg-black\\/40');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose from header icon button and footer text button', () => {
    const onClose = vi.fn();
    const file = new Blob(['x'], { type: 'application/pdf' });
    render(<PdfPreviewModal isOpen onClose={onClose} file={file} title="T" />);

    const headerClose = screen
      .getAllByRole('button', { name: 'chatClose' })
      .find((el) => el.tagName === 'BUTTON');
    const footerClose = screen
      .getAllByRole('button', { name: /Kapat/i })
      .find((el) => el.tagName === 'BUTTON');
    if (!headerClose || !footerClose) {
      throw new Error('expected close buttons');
    }
    fireEvent.click(headerClose);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(footerClose);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('updates when title or file changes', () => {
    const file1 = new Blob(['a'], { type: 'application/pdf' });
    const file2 = new Blob(['bb'], { type: 'application/pdf' });
    const { rerender } = render(
      <PdfPreviewModal isOpen onClose={vi.fn()} file={file1} title="Bir" />,
    );

    expect(screen.getByRole('heading', { name: 'Bir' })).toBeInTheDocument();

    rerender(<PdfPreviewModal isOpen onClose={vi.fn()} file={file2} title="İki" />);

    expect(screen.getByRole('heading', { name: 'İki' })).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer')).toHaveTextContent('blob:2');
  });

  it('unmounts content when closed after open', () => {
    const { rerender, container } = render(
      <PdfPreviewModal isOpen onClose={vi.fn()} file={new Blob(['x'])} title="T" />,
    );
    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();

    rerender(<PdfPreviewModal isOpen={false} onClose={vi.fn()} file={new Blob(['x'])} title="T" />);
    expect(container.firstChild).toBeNull();
  });
});
