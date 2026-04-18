import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProChatPanel from '../ProChatPanel';

vi.mock('framer-motion', () => {
  const passthrough = (Tag: keyof JSX.IntrinsicElements) => {
    const Component = ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement(Tag, rest, children);
    Component.displayName = `motion.${String(Tag)}`;
    return Component;
  };
  return {
    motion: {
      div: passthrough('div'),
      button: passthrough('button'),
      span: passthrough('span'),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

const showErrorMock = vi.fn();
vi.mock('@/context/PopupContext', () => ({
  usePopup: () => ({
    showError: showErrorMock,
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
  }),
}));
const tMock = vi.fn((key: string) => key);
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({ t: tMock }),
}));
const mockPdfFileRef: { current: File | null } = { current: null };
vi.mock('@/context/PdfContext', () => ({
  usePdf: () => ({ pdfFile: mockPdfFileRef.current }),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

describe('ProChatPanel (presentational)', () => {
  beforeEach(() => {
    mockPdfFileRef.current = null;
    showErrorMock.mockClear();
    tMock.mockImplementation((key: string) => key);
  });

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    messages: [],
    onSend: vi.fn(),
    onFileUpload: vi.fn(),
    loading: false,
    initializing: false,
    input: '',
    setInput: vi.fn(),
    headerTitle: 'Neuro AI',
    avatarSrc: null,
    userName: 'Test User',
  };

  it('renders when open', () => {
    render(<ProChatPanel {...defaultProps} />);
    expect(screen.getByText('Neuro AI')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/chatPlaceholder/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <ProChatPanel {...defaultProps} isOpen={false} />
    );
    expect(screen.queryByText('Neuro AI')).not.toBeInTheDocument();
  });

  it('displays messages', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        messages={[
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ]}
      />
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ProChatPanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('chat-panel-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls setInput when typing', () => {
    const setInput = vi.fn();
    render(<ProChatPanel {...defaultProps} setInput={setInput} />);
    const input = screen.getByPlaceholderText(/chatPlaceholder/i);
    fireEvent.change(input, { target: { value: 'Test' } });
    expect(setInput).toHaveBeenCalledWith('Test');
  });

  it('calls onSend when form is submitted', () => {
    const onSend = vi.fn();
    render(
      <ProChatPanel
        {...defaultProps}
        input="Hello"
        setInput={vi.fn()}
        onSend={onSend}
      />
    );
    const form = screen
      .getByPlaceholderText(/chatPlaceholder/i)
      .closest('form');
    if (form) {
      fireEvent.submit(form);
    }
    expect(onSend).toHaveBeenCalled();
  });

  it('shows initializing state', () => {
    render(<ProChatPanel {...defaultProps} initializing={true} />);
    expect(screen.getByText(/chatInitializing/i)).toBeInTheDocument();
  });

  it('shows loading (typing) label', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        loading={true}
        typingLabel="AI is typing..."
      />
    );
    expect(screen.getByText('AI is typing...')).toBeInTheDocument();
  });

  it('shows headerSubtitle when provided', () => {
    render(<ProChatPanel {...defaultProps} headerSubtitle="PDF AI Asistanı" />);
    expect(screen.getByText('PDF AI Asistanı')).toBeInTheDocument();
  });

  it('shows custom placeholder', () => {
    render(
      <ProChatPanel {...defaultProps} placeholder="Ask about your PDF..." />
    );
    expect(
      screen.getByPlaceholderText('Ask about your PDF...')
    ).toBeInTheDocument();
  });

  it('disables input when loading or initializing', () => {
    const { rerender } = render(<ProChatPanel {...defaultProps} />);
    expect(screen.getByPlaceholderText(/chatPlaceholder/i)).not.toBeDisabled();

    rerender(<ProChatPanel {...defaultProps} loading={true} />);
    expect(screen.getByPlaceholderText(/chatPlaceholder/i)).toBeDisabled();

    rerender(
      <ProChatPanel {...defaultProps} loading={false} initializing={true} />
    );
    expect(screen.getByPlaceholderText(/chatPlaceholder/i)).toBeDisabled();
  });

  it('renders prompt suggestion chips and sends text on click', () => {
    const onSend = vi.fn();
    const suggestions = [
      { text: 'Bu belgenin sayfalarını ayır', icon: '✂️' },
      { text: 'Ekranı temizle', icon: '🧹' },
    ];
    render(
      <ProChatPanel
        {...defaultProps}
        onSend={onSend}
        promptSuggestions={suggestions}
        promptSuggestionsDisabled={false}
      />
    );
    expect(
      screen.getByRole('button', { name: /Bu belgenin sayfalarını ayır/i })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Bu belgenin sayfalarını ayır/i })
    );
    expect(onSend).toHaveBeenCalledWith('Bu belgenin sayfalarını ayır');
  });

  it('opens hidden file input when attach PDF button is clicked', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(<ProChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText(/^chatPdfAria$/i));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('calls onVoiceToggle when voice button is clicked', () => {
    const onVoiceToggle = vi.fn();
    render(<ProChatPanel {...defaultProps} onVoiceToggle={onVoiceToggle} />);
    fireEvent.click(screen.getByLabelText(/^chatVoiceAria$/i));
    expect(onVoiceToggle).toHaveBeenCalled();
  });

  it('shows recording placeholder and pulse when isRecording', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        isRecording={true}
        onVoiceToggle={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/chatListening/i)).toBeInTheDocument();
  });

  it('uses auto scroll behavior when multiple messages arrive at once', async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const one = [{ role: 'user' as const, content: 'a' }];
    const many = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' },
      { role: 'user' as const, content: 'c' },
    ];
    const { rerender } = render(
      <ProChatPanel {...defaultProps} messages={one} />
    );
    rerender(<ProChatPanel {...defaultProps} messages={many} />);
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    const withAuto = scrollIntoView.mock.calls.some(
      (c) => c[0]?.behavior === 'auto'
    );
    expect(withAuto).toBe(true);
  });

  it('uploads valid pdf via hidden file input', () => {
    const onFileUpload = vi.fn();
    const { container } = render(
      <ProChatPanel {...defaultProps} onFileUpload={onFileUpload} />
    );
    const pdf = new File(['%PDF'], 'ok.pdf', { type: 'application/pdf' });
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf] } });
    expect(onFileUpload).toHaveBeenCalledWith(pdf);
  });

  it('shows two-letter initials for multi-word userName', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        messages={[{ role: 'user', content: 'Hi' }]}
        userName="Jane Doe"
      />
    );
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('uses initials fallback when userName is empty', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        messages={[{ role: 'user', content: 'Hi' }]}
        userName=""
      />
    );
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('shows user avatar image when avatarSrc is set', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        messages={[{ role: 'user', content: 'Hi' }]}
        avatarSrc="https://example.com/a.png"
        userName="Jane Doe"
      />
    );
    const img = document.querySelector('img[src="https://example.com/a.png"]');
    expect(img).toBeTruthy();
  });

  it('drag over shows drop overlay and drop uploads pdf', () => {
    const onFileUpload = vi.fn();
    const pdf = new File(['%PDF'], 'dropped.pdf', { type: 'application/pdf' });
    const { container } = render(
      <ProChatPanel {...defaultProps} onFileUpload={onFileUpload} />
    );
    const fixedPanels = container.querySelectorAll('.fixed');
    const panel = fixedPanels[fixedPanels.length - 1] as HTMLElement;
    fireEvent.dragOver(panel, {
      dataTransfer: {
        types: [],
        files: [],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(screen.getByText(/chatDropActive/i)).toBeInTheDocument();
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [pdf],
        types: ['Files'],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(onFileUpload).toHaveBeenCalledWith(pdf);
  });

  it('validateAndUpload uses fallback strings when t returns empty', () => {
    tMock.mockImplementation(() => '');
    const onFileUpload = vi.fn();
    const { container } = render(
      <ProChatPanel {...defaultProps} onFileUpload={onFileUpload} />
    );
    const panel = container
      .querySelectorAll('.fixed')
      .item(container.querySelectorAll('.fixed').length - 1) as HTMLElement;
    const bad = new File(['x'], 'x.txt', { type: 'text/plain' });
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [bad],
        types: ['Files'],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(showErrorMock).toHaveBeenCalledWith(
      'Sadece PDF dosyaları yüklenebilir.'
    );

    const huge = new File([new ArrayBuffer(60 * 1024 * 1024)], 'h.pdf', {
      type: 'application/pdf',
    });
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [huge],
        types: ['Files'],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(
      showErrorMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && /Maks|max/i.test(c[0] as string)
      )
    ).toBe(true);
  });

  it('validateAndUpload rejects non-pdf and oversized files', () => {
    const onFileUpload = vi.fn();
    const { container } = render(
      <ProChatPanel {...defaultProps} onFileUpload={onFileUpload} />
    );
    const fixedPanels = container.querySelectorAll('.fixed');
    const panel = fixedPanels[fixedPanels.length - 1] as HTMLElement;
    const bad = new File(['x'], 'x.txt', { type: 'text/plain' });
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [bad],
        types: ['Files'],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(showErrorMock).toHaveBeenCalled();
    expect(onFileUpload).not.toHaveBeenCalled();

    showErrorMock.mockClear();
    const huge = new File([new ArrayBuffer(60 * 1024 * 1024)], 'h.pdf', {
      type: 'application/pdf',
    });
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [huge],
        types: ['Files'],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(showErrorMock).toHaveBeenCalled();
  });

  it('clears dragging state on drag leave', () => {
    const { container } = render(<ProChatPanel {...defaultProps} />);
    const fixedPanels = container.querySelectorAll('.fixed');
    const panel = fixedPanels[fixedPanels.length - 1] as HTMLElement;
    fireEvent.dragOver(panel, {
      dataTransfer: {
        types: [],
        files: [],
        getData: () => '',
      } as unknown as DataTransfer,
    });
    expect(screen.getByText(/chatDropActive/i)).toBeInTheDocument();
    fireEvent.dragLeave(panel);
    expect(screen.queryByText(/chatDropActive/i)).not.toBeInTheDocument();
  });

  it('calls onClose when mobile backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ProChatPanel {...defaultProps} onClose={onClose} />
    );
    const backdrop = container.querySelector(
      '.fixed.inset-0.sm\\:hidden'
    ) as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('cancels animation frame on unmount', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = render(
      <ProChatPanel
        {...defaultProps}
        messages={[{ role: 'user', content: 'm' }]}
      />
    );
    unmount();
    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
  });

  it('drop from panel forwards active pdf', () => {
    const panelPdf = new File(['%PDF'], 'panel.pdf', {
      type: 'application/pdf',
    });
    mockPdfFileRef.current = panelPdf;
    const onFileUpload = vi.fn();
    const { container } = render(
      <ProChatPanel {...defaultProps} onFileUpload={onFileUpload} />
    );
    const fixedPanels = container.querySelectorAll('.fixed');
    const panel = fixedPanels[fixedPanels.length - 1] as HTMLElement;
    fireEvent.drop(panel, {
      dataTransfer: {
        files: [],
        getData: (mime: string) =>
          mime === 'application/x-neuro-pdf' ? '{}' : '',
      } as unknown as DataTransfer,
    });
    expect(onFileUpload).toHaveBeenCalledWith(panelPdf);
  });
});
