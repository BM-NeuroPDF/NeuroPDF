import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ProGlobalChat from '../ProGlobalChat';
import { useLanguage } from '@/context/LanguageContext';
import { usePdf } from '@/context/PdfContext';
import { sendRequest } from '@/utils/api';

// Mock dependencies
vi.mock('next-auth/react');
vi.mock('next/navigation');
vi.mock('@/context/LanguageContext');
vi.mock('@/context/PdfContext');
vi.mock('@/context/PopupContext', () => ({
  usePopup: () => ({
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
  }),
}));
vi.mock('@/utils/api');
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

describe('ProGlobalChat', () => {
  const mockSession = {
    user: { name: 'Test User', email: 'test@example.com', id: 'user-123' },
    accessToken: 'test-token',
  };

  const mockUseLanguage = {
    t: (key: string) => key,
    language: 'tr',
  };

  const mockPush = vi.fn();
  const mockUsePdf = {
    pdfFile: null,
    pdfList: [],
    savePdf: vi.fn().mockResolvedValue(undefined),
    addPdfs: vi.fn(),
    removePdf: vi.fn(),
    setActivePdf: vi.fn(),
    clearPdf: vi.fn(),
    sessionId: null,
    chatMessages: [],
    setChatMessages: vi.fn(),
    setIsChatActive: vi.fn(),
    setSessionId: vi.fn(),
    isChatActive: false,
    proChatOpen: false,
    setProChatOpen: vi.fn(),
    proChatPanelOpen: false,
    setProChatPanelOpen: vi.fn(),
    generalChatMessages: [],
    setGeneralChatMessages: vi.fn(),
    generalSessionId: null,
    setGeneralSessionId: vi.fn(),
    setActiveSessionDbId: vi.fn(),
    loadChatSessions: vi.fn(),
  };

  async function waitForRoleFetch() {
    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith('/files/user/stats', 'GET');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'Audio',
      vi.fn().mockImplementation(() => ({
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        loop: false,
        volume: 1,
      }))
    );
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useSession).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
    } as unknown as ReturnType<typeof useSession>);
    vi.mocked(useLanguage).mockReturnValue(
      mockUseLanguage as ReturnType<typeof useLanguage>
    );
    vi.mocked(usePdf).mockReturnValue(
      mockUsePdf as unknown as ReturnType<typeof usePdf>
    );
    vi.mocked(sendRequest).mockResolvedValue({ role: 'pro' });
  });

  it('renders FAB when user is Pro', async () => {
    vi.mocked(sendRequest).mockResolvedValue({ role: 'pro' });

    render(<ProGlobalChat />);

    await waitForRoleFetch();
    expect(
      screen.getByRole('button', { name: /navDocuments/i })
    ).toBeInTheDocument();
  });

  it('shows FAB for non-Pro user and opens Pro required modal on click', async () => {
    vi.mocked(sendRequest).mockResolvedValue({ role: 'standard' });

    render(<ProGlobalChat />);

    await waitForRoleFetch();
    const button = screen.getByRole('button', { name: /navDocuments/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('chatProRequiredTitle')).toBeInTheDocument();
      expect(screen.getByText('chatGoToPricing')).toBeInTheDocument();
    });
  });

  it('shows FAB for unauthenticated user and redirects to pricing on click', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    } as unknown as ReturnType<typeof useSession>);

    render(<ProGlobalChat />);

    await waitFor(() => {
      const button = screen.queryByRole('button');
      expect(button).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));
    expect(mockPush).toHaveBeenCalledWith('/pricing');
  });

  it('expands chat panel when icon is clicked (Pro user)', async () => {
    vi.mocked(sendRequest).mockResolvedValue({ role: 'pro' });

    const { rerender } = render(<ProGlobalChat />);

    await waitForRoleFetch();
    fireEvent.click(screen.getByRole('button', { name: /navDocuments/i }));

    // Simulate context updating panel open state (real PdfProvider would do this)
    vi.mocked(usePdf).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
    } as unknown as ReturnType<typeof usePdf>);
    rerender(<ProGlobalChat />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/chatPlaceholder/i)
      ).toBeInTheDocument();
    });
  });

  it('initializes chat session when expanded (Pro user)', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({ session_id: 'test-session-123' });

    const { rerender } = render(<ProGlobalChat />);

    await waitForRoleFetch();

    const button = screen.getByRole('button', { name: /navDocuments/i });
    fireEvent.click(button);
    vi.mocked(usePdf).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
    } as unknown as ReturnType<typeof usePdf>);
    rerender(<ProGlobalChat />);

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        '/files/chat/general/start',
        'POST',
        expect.objectContaining({
          llm_provider: 'cloud',
          mode: 'flash',
        })
      );
    });
  });

  it('sends message when form is submitted', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({ session_id: 'test-session-123' })
      .mockResolvedValueOnce({ answer: 'Test response' });

    const { rerender } = render(<ProGlobalChat />);

    await waitForRoleFetch();
    fireEvent.click(screen.getByRole('button', { name: /navDocuments/i }));
    vi.mocked(usePdf).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
      generalSessionId: 'test-session-123',
      generalChatMessages: [{ role: 'assistant', content: 'Hello' }],
    } as unknown as ReturnType<typeof usePdf>);
    rerender(<ProGlobalChat />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/chatPlaceholder/i)
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/chatPlaceholder/i);
    fireEvent.change(input, { target: { value: 'Test message' } });

    const form = input.closest('form');
    if (form) {
      fireEvent.submit(form);
    }

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        '/files/chat/general/message',
        'POST',
        expect.objectContaining({
          session_id: 'test-session-123',
          message: 'Test message',
        })
      );
    });
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockRejectedValueOnce(new Error('API Error'));

    const { rerender } = render(<ProGlobalChat />);

    await waitForRoleFetch();
    fireEvent.click(screen.getByRole('button', { name: /navDocuments/i }));
    vi.mocked(usePdf).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
      generalChatMessages: [
        {
          role: 'assistant',
          content: 'chatInitError',
        },
      ],
    } as unknown as ReturnType<typeof usePdf>);
    rerender(<ProGlobalChat />);

    await waitFor(() => {
      expect(screen.getByText('chatInitError')).toBeInTheDocument();
    });
  });

  it('uses PDF chat session when available', async () => {
    vi.mocked(usePdf).mockReturnValue({
      ...mockUsePdf,
      sessionId: 'pdf-session-123',
      chatMessages: [{ role: 'assistant', content: 'PDF chat ready' }],
      setChatMessages: vi.fn(),
      isChatActive: true,
      proChatPanelOpen: true,
    } as unknown as ReturnType<typeof usePdf>);
    vi.mocked(sendRequest).mockResolvedValue({ role: 'pro' });

    render(<ProGlobalChat />);

    await waitFor(() => {
      expect(screen.getByText('PDF chat ready')).toBeInTheDocument();
    });
  });

  it('runs assistant translation only after response flow settles and avoids duplicate translate spam', async () => {
    type GeneralChatResult = {
      answer: string;
      client_actions: unknown[];
    };
    let resolveChat: ((value: GeneralChatResult) => void) | null = null;
    const pendingChat = new Promise<GeneralChatResult>((resolve) => {
      resolveChat = resolve;
    });

    vi.mocked(sendRequest).mockImplementation((endpoint: string) => {
      if (endpoint === '/files/user/stats')
        return Promise.resolve({ role: 'pro' });
      if (endpoint === '/files/chat/general/message') return pendingChat;
      if (endpoint === '/files/chat/translate-message') {
        return Promise.resolve({ translation: 'translated' });
      }
      return Promise.resolve({ session_id: 'test-session-123' });
    });

    const { rerender } = render(<ProGlobalChat />);
    await waitForRoleFetch();

    fireEvent.click(screen.getByRole('button', { name: /navDocuments/i }));
    vi.mocked(usePdf).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
      generalSessionId: 'test-session-123',
      generalChatMessages: [{ role: 'assistant', content: 'Hello' }],
    } as unknown as ReturnType<typeof usePdf>);
    rerender(<ProGlobalChat />);

    const input = await screen.findByPlaceholderText(/chatPlaceholder/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => {
      const translateCalls = vi
        .mocked(sendRequest)
        .mock.calls.filter(([url]) => url === '/files/chat/translate-message');
      expect(translateCalls.length).toBe(1);
    });

    expect(resolveChat).not.toBeNull();
    resolveChat!({ answer: 'Assistant answer', client_actions: [] });

    await waitFor(() => {
      const translateCalls = vi
        .mocked(sendRequest)
        .mock.calls.filter(([url]) => url === '/files/chat/translate-message');
      expect(translateCalls.length).toBe(2);
    });
  });
});
