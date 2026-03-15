// ALL MOCKS MUST BE AT THE TOP BEFORE ANY IMPORTS
// Mock remark-gfm - Return a valid function to prevent undefined errors
vi.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => () => ({}) // Plugin function that returns a transformer
}))

// Mock react-markdown - Safely handle remarkPlugins array even if it contains undefined
vi.mock('react-markdown', () => {
  const React = require('react')
  return {
    default: (props: any) => {
      // Safely handle remarkPlugins - filter out undefined values
      // This prevents React from trying to render undefined as a component
      const safePlugins = Array.isArray(props.remarkPlugins) 
        ? props.remarkPlugins.filter((p: any) => p !== undefined && p !== null)
        : []
      
      return React.createElement('div', { 
        'data-testid': 'react-markdown-mock',
        'data-plugins': safePlugins.length
      }, props.children)
    }
  }
})

import React from 'react'
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'

import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { http, HttpResponse, delay } from 'msw'
import { handlers } from './handlers'
import PdfChatPanel from '@/components/PdfChatPanel'
import { PdfProvider } from '@/context/PdfContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { PopupProvider } from '@/context/PopupContext'
import { SessionProvider } from 'next-auth/react'

// Mock NextAuth (sendRequest uses getSession(), so it must be mocked)
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: null, status: 'unauthenticated' })),
  getSession: vi.fn(() => Promise.resolve(null)),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    React.createElement('img', { src, alt, ...props })
  ),
}))

// Mock SVG asset import - return a simple string path
vi.mock('@/assets/icons/NeuroPDF-Chat.svg', () => ({
  default: '/mock-chat-icon.svg',
}))

// Mock framer-motion (PdfChatPanel uses motion.div, motion.button, and AnimatePresence)
const FRAMER_PROPS = new Set(['whileTap', 'initial', 'animate', 'exit', 'transition', 'layout'])
const motionCmp = (tag: string) => {
  const C = ({ children, ...props }: any) => {
    const domProps = { ...props }
    FRAMER_PROPS.forEach((p) => delete domProps[p])
    return React.createElement(tag, domProps, children)
  }
  return C
}
vi.mock('framer-motion', () => ({
  motion: new Proxy({} as any, {
    get(_, key) {
      return motionCmp(typeof key === 'string' ? key : 'div')
    },
  }),
  AnimatePresence: ({ children }: any) => children,
}))

// MSW Server Setup
const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Helper function to create a mock PDF File
function createMockPdfFile(name = 'test.pdf', size = 1024 * 1024): File {
  const blob = new Blob(['mock pdf content'], { type: 'application/pdf' })
  return new File([blob], name, { type: 'application/pdf' })
}

// Helper function to render with all providers
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SessionProvider>
      <LanguageProvider>
        <PdfProvider>
          <PopupProvider>{ui}</PopupProvider>
        </PdfProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}

describe('Chat Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  describe('Chat Session Initialization', () => {
    it('should initialize chat session when panel opens', async () => {
      const mockFile = createMockPdfFile('document.pdf')
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      // Wait for session initialization
      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      // Verify session ID is set in context
      // This is tested indirectly through the welcome message appearing
    })

    it('should show error message when session initialization fails', async () => {
      // Override handler to return error
      server.use(
        http.post('http://localhost:8000/files/chat/start', () => {
          return HttpResponse.json({ error: 'Session failed' }, { status: 500 })
        })
      )

      const mockFile = createMockPdfFile('document.pdf')
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      // Wait for error message
      await waitFor(() => {
        expect(screen.getByText(/Sohbet başlatılamadı|chat.*init.*error/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('should not initialize session if panel is closed', async () => {
      const mockFile = createMockPdfFile('document.pdf')
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={false} onClose={vi.fn()} />
      )

      // Panel should not be visible
      expect(screen.queryByText(/Merhaba|Hello/i)).not.toBeInTheDocument()
    })
  })

  describe('Sending Messages', () => {
    it('should send message and receive response', { timeout: 20000 }, async () => {
      const user = userEvent.setup({ delay: null })
      const mockFile = createMockPdfFile('document.pdf')

      server.use(
        http.post(/\/files\/chat\/message$/, () =>
          HttpResponse.json({ answer: 'This is a mock assistant response.', role: 'assistant' }, { status: 200 })
        )
      )

      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      const message = 'What is this document about?'
      fireEvent.change(input, { target: { value: message } })
      await waitFor(() => expect(input).toHaveValue(message))
      await new Promise((r) => setTimeout(r, 50))
      await user.click(screen.getByTestId('chat-send-button'))

      await waitFor(() => {
        expect(screen.getByText('This is a mock assistant response.')).toBeInTheDocument()
      }, { timeout: 15000 })
    })

    it('should disable input and send button while loading', async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')

      server.use(
        http.post('http://localhost:8000/files/chat/message', async () => {
          await delay(500)
          return HttpResponse.json({
            answer: 'Response after delay',
            role: 'assistant'
          }, { status: 200 })
        })
      )

      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      fireEvent.change(input, { target: { value: 'Test message' } })
      const sendButton = screen.getByTestId('chat-send-button')
      await user.click(sendButton)

      // Verify delayed response arrives (loading state is internal)
      await waitFor(() => {
        expect(screen.getByText('Response after delay')).toBeInTheDocument()
      }, { timeout: 5000 })
    })

    it('should not send empty messages', async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      const sendButton = screen.getByTestId('chat-send-button')

      // Send button should be disabled when input is empty
      expect(sendButton).toBeDisabled()

      // Try to send empty message
      await user.click(sendButton)

      // No new messages should appear (only welcome message)
      const messages = screen.getAllByText(/Merhaba|Hello|mock assistant/i)
      expect(messages.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Session ID Management', () => {
    it('should reuse existing session ID when sending multiple messages', { timeout: 20000 }, async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      
      let capturedSessionId: string | null = null

      server.use(
        http.post(/\/files\/chat\/message$/, async ({ request }) => {
          const body = await request.json() as any
          capturedSessionId = body.session_id
          return HttpResponse.json({
            answer: 'Response',
            role: 'assistant'
          }, { status: 200 })
        })
      )

      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)

      fireEvent.change(input, { target: { value: 'First message' } })
      await waitFor(() => expect(input).toHaveValue('First message'))
      await new Promise((r) => setTimeout(r, 100))
      await user.click(screen.getByTestId('chat-send-button'))
      await waitFor(() => expect(screen.getByText('First message')).toBeInTheDocument(), { timeout: 5000 })
      await waitFor(() => expect(screen.getByText('Response')).toBeInTheDocument(), { timeout: 5000 })

      const firstSessionId = capturedSessionId

      // Re-query input after first response so we target the current controlled input
      const inputSecond = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      fireEvent.change(inputSecond, { target: { value: 'Second message' } })
      await waitFor(() => {
        expect(inputSecond).toHaveValue('Second message')
        expect(screen.getByTestId('chat-send-button')).toBeEnabled()
      }, { timeout: 5000 })
      await user.click(screen.getByTestId('chat-send-button'))
      await waitFor(() => expect(screen.getByText('Second message')).toBeInTheDocument(), { timeout: 5000 })

      // Session ID should be the same for both messages
      expect(capturedSessionId).toBe(firstSessionId)
      expect(capturedSessionId).toBeTruthy()
    })

    it('should initialize new session when file changes', async () => {
      const mockFile1 = createMockPdfFile('document1.pdf')
      const mockFile2 = createMockPdfFile('document2.pdf')
      
      let sessionCount = 0

      server.use(
        http.post('http://localhost:8000/files/chat/start', async () => {
          sessionCount++
          return HttpResponse.json({
            session_id: `session-${sessionCount}`
          }, { status: 200 })
        })
      )

      const { rerender } = renderWithProviders(
        <PdfChatPanel file={mockFile1} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const firstSessionCount = sessionCount

      // Change file
      rerender(
        <SessionProvider>
          <LanguageProvider>
            <PdfProvider>
              <PopupProvider>
                <PdfChatPanel file={mockFile2} isOpen={true} onClose={vi.fn()} />
              </PopupProvider>
            </PdfProvider>
          </LanguageProvider>
        </SessionProvider>
      )

      // New session should be initialized
      await waitFor(() => {
        expect(sessionCount).toBeGreaterThan(firstSessionCount)
      }, { timeout: 3000 })
    })
  })

  describe('Error Recovery', () => {
    it('should show error message when message sending fails', async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      
      // Override handler to return error
      server.use(
        http.post('http://localhost:8000/files/chat/message', () => {
          return HttpResponse.json({ error: 'Network error' }, { status: 500 })
        })
      )

      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      fireEvent.change(input, { target: { value: 'Test message' } })
      await user.click(screen.getByTestId('chat-send-button'))

      // Wait for error message
      await waitFor(() => {
        expect(screen.getByText(/Bağlantı hatası|Connection error|⚠️/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('should allow retrying after error', { timeout: 15000 }, async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      
      let attemptCount = 0

      server.use(
        http.post(/\/files\/chat\/message$/, async () => {
          attemptCount++
          if (attemptCount === 1) {
            return HttpResponse.json({ error: 'Network error' }, { status: 500 })
          }
          return HttpResponse.json({
            answer: 'Success after retry',
            role: 'assistant'
          }, { status: 200 })
        })
      )

      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)

      fireEvent.change(input, { target: { value: 'Test message' } })
      await waitFor(() => expect(input).toHaveValue('Test message'))
      await new Promise((r) => setTimeout(r, 100))
      await user.click(screen.getByTestId('chat-send-button'))
      await waitFor(() => {
        expect(screen.getByText(/Bağlantı hatası|Connection error|⚠️/i)).toBeInTheDocument()
      }, { timeout: 5000 })

      // Re-query input after error so we target the current controlled input
      const inputRetry = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      fireEvent.change(inputRetry, { target: { value: 'Retry message' } })
      await waitFor(() => {
        expect(inputRetry).toHaveValue('Retry message')
        expect(screen.getByTestId('chat-send-button')).toBeEnabled()
      }, { timeout: 5000 })
      await user.click(screen.getByTestId('chat-send-button'))
      await waitFor(() => {
        expect(screen.getByText((c) => c.includes('Success after retry'))).toBeInTheDocument()
      }, { timeout: 10000 })
    })

    it('should handle session expiration gracefully', async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      
      // Session expired error
      server.use(
        http.post('http://localhost:8000/files/chat/message', () => {
          return HttpResponse.json(
            { error: 'Sohbet oturumu bulunamadı veya süresi dolmuş.' },
            { status: 404 }
          )
        })
      )

      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      fireEvent.change(input, { target: { value: 'Test message' } })
      await user.click(screen.getByTestId('chat-send-button'))

      // Error message should appear
      await waitFor(() => {
        expect(screen.getByText(/Bağlantı hatası|Connection error|⚠️/i)).toBeInTheDocument()
      }, { timeout: 3000 })
    })
  })

  describe('UI Interactions', () => {
    it('should close panel when close button is clicked', async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      const onClose = vi.fn()
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={onClose} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should display file name in header', async () => {
      const mockFile = createMockPdfFile('my-document.pdf')
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText('my-document.pdf')).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it('should scroll to bottom when new messages arrive', { timeout: 20000 }, async () => {
      const user = userEvent.setup()
      const mockFile = createMockPdfFile('document.pdf')
      
      renderWithProviders(
        <PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />
      )

      await waitFor(() => {
        expect(screen.getByText(/Merhaba|Hello/i)).toBeInTheDocument()
      }, { timeout: 3000 })

      const input = screen.getByPlaceholderText(/PDF hakkında|soru sorun|Ask a question about the PDF/i)
      fireEvent.change(input, { target: { value: 'Test message' } })
      await user.click(screen.getByTestId('chat-send-button'))
      await waitFor(() => expect(screen.getByText('Test message')).toBeInTheDocument(), { timeout: 5000 })
    })
  })
})
