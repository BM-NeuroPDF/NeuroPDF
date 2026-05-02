// Mocks at top
vi.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => () => ({}),
}));

vi.mock('react-markdown', () => {
  const React = require('react');
  return {
    default: (props: { children?: string }) =>
      React.createElement(
        'div',
        { 'data-testid': 'react-markdown-mock' },
        props.children
      ),
  };
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from 'next-auth/react';
import ProChatPanel from '@/components/ProChatPanel';
import { PdfProvider } from '@/context/PdfContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { PopupProvider } from '@/context/PopupContext';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}));

vi.mock('@/assets/icons/NeuroPDF-Chat.svg', () => ({
  default: '/mock-chat-icon.svg',
}));

const motionCmp = (tag: string) => {
  const C = ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    const domProps = { ...props };
    ['whileTap', 'initial', 'animate', 'exit', 'transition', 'layout'].forEach(
      (p) => delete domProps[p]
    );
    return React.createElement(tag, domProps, children);
  };
  return C;
};
vi.mock('framer-motion', () => ({
  motion: new Proxy({} as Record<string, unknown>, {
    get(_, key) {
      return motionCmp(typeof key === 'string' ? key : 'div');
    },
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SessionProvider
      session={null}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <LanguageProvider>
        <PdfProvider>
          <PopupProvider>{ui}</PopupProvider>
        </PdfProvider>
      </LanguageProvider>
    </SessionProvider>
  );
}

const defaultPanelProps = {
  isOpen: true,
  onClose: vi.fn(),
  messages: [] as { role: 'user' | 'assistant'; content: string }[],
  onSend: vi.fn(),
  onFileUpload: vi.fn(),
  loading: false,
  initializing: false,
  input: '',
  setInput: vi.fn(),
  headerTitle: 'Neuro AI',
  headerSubtitle: 'Genel AI Asistanı',
  avatarSrc: null as string | null,
  userName: 'Test User',
  placeholder: 'Sorunuzu yazın...',
  disclaimer: 'NeuroPDF yapay zekası bazen hata yapabilir.',
};

describe('Chat Integration (ProChatPanel)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  describe('Panel visibility', () => {
    it('renders panel when isOpen is true', () => {
      renderWithProviders(<ProChatPanel {...defaultPanelProps} />);
      expect(
        screen.getByPlaceholderText('Sorunuzu yazın...')
      ).toBeInTheDocument();
    });

    it('does not render panel when isOpen is false', () => {
      renderWithProviders(
        <ProChatPanel {...defaultPanelProps} isOpen={false} />
      );
      expect(
        screen.queryByPlaceholderText('Sorunuzu yazın...')
      ).not.toBeInTheDocument();
    });
  });

  describe('Messages display', () => {
    it('displays welcome message when messages prop contains it', () => {
      renderWithProviders(
        <ProChatPanel
          {...defaultPanelProps}
          messages={[
            {
              role: 'assistant',
              content: '👋 Merhaba! Ben NeuroPDF AI asistanıyım.',
            },
          ]}
        />
      );
      expect(
        screen.getByText(/Merhaba! Ben NeuroPDF AI asistanıyım/i)
      ).toBeInTheDocument();
    });

    it('displays user and assistant messages', () => {
      renderWithProviders(
        <ProChatPanel
          {...defaultPanelProps}
          messages={[
            { role: 'user', content: 'Test sorusu' },
            { role: 'assistant', content: 'Test yanıtı' },
          ]}
        />
      );
      expect(screen.getByText('Test sorusu')).toBeInTheDocument();
      expect(screen.getByText('Test yanıtı')).toBeInTheDocument();
    });
  });

  describe('Sending messages', () => {
    it('calls onSend when user submits form with text', async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      const setInput = vi.fn();
      renderWithProviders(
        <ProChatPanel
          {...defaultPanelProps}
          input=""
          setInput={setInput}
          onSend={onSend}
        />
      );
      const input = screen.getByPlaceholderText('Sorunuzu yazın...');
      await user.type(input, 'Merhaba');
      expect(setInput).toHaveBeenCalled();
      const form = input.closest('form');
      if (form) fireEvent.submit(form);
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('send button is disabled when input is empty', () => {
      renderWithProviders(<ProChatPanel {...defaultPanelProps} input="" />);
      expect(screen.getByTestId('chat-send-button')).toBeDisabled();
    });

    it('send button is disabled when loading', () => {
      renderWithProviders(
        <ProChatPanel {...defaultPanelProps} input="test" loading={true} />
      );
      expect(screen.getByTestId('chat-send-button')).toBeDisabled();
    });
  });

  describe('Close and header', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithProviders(
        <ProChatPanel {...defaultPanelProps} onClose={onClose} />
      );
      await user.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('displays header title and subtitle', () => {
      renderWithProviders(
        <ProChatPanel
          {...defaultPanelProps}
          headerTitle="Neuro AI"
          headerSubtitle="PDF AI Asistanı"
        />
      );
      expect(screen.getByText('Neuro AI')).toBeInTheDocument();
      expect(screen.getByText('PDF AI Asistanı')).toBeInTheDocument();
    });
  });

  describe('Loading and initializing states', () => {
    it('shows initializing label when initializing is true', () => {
      renderWithProviders(
        <ProChatPanel {...defaultPanelProps} initializing={true} />
      );
      expect(screen.getByText('Başlatılıyor...')).toBeInTheDocument();
    });

    it('shows typing label when loading is true', () => {
      renderWithProviders(
        <ProChatPanel
          {...defaultPanelProps}
          loading={true}
          typingLabel="Neuro yanıt yazıyor..."
        />
      );
      expect(screen.getByText('Neuro yanıt yazıyor...')).toBeInTheDocument();
    });
  });
});
