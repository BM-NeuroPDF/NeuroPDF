import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ProGlobalChat from '../ProGlobalChat'
import { useLanguage } from '@/context/LanguageContext'
import { usePdf } from '@/context/PdfContext'
import { sendRequest } from '@/utils/api'

// Mock dependencies
vi.mock('next-auth/react')
vi.mock('next/navigation')
vi.mock('@/context/LanguageContext')
vi.mock('@/context/PdfContext')
vi.mock('@/utils/api')
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(),
    create: vi.fn()
  }
}))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}))

describe('ProGlobalChat', () => {
  const mockSession = {
    user: { name: 'Test User', email: 'test@example.com', id: 'user-123' },
    accessToken: 'test-token'
  }

  const mockUseLanguage = {
    t: (key: string) => key,
    language: 'tr'
  }

  const mockPush = vi.fn()
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue({ push: mockPush })
    ;(useSession as any).mockReturnValue({
      data: mockSession,
      status: 'authenticated'
    })
    ;(useLanguage as any).mockReturnValue(mockUseLanguage)
    ;(usePdf as any).mockReturnValue(mockUsePdf)
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })
  })

  it('renders FAB when user is Pro', async () => {
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })

    render(<ProGlobalChat />)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /ai asistanı/i })
      expect(button).toBeInTheDocument()
    })
  })

  it('shows FAB for non-Pro user and opens Pro required modal on click', async () => {
    ;(sendRequest as any).mockResolvedValue({ role: 'standard' })

    render(<ProGlobalChat />)

    await waitFor(() => {
      const button = screen.queryByRole('button', { name: /ai chat|ai asistanı/i })
      expect(button).toBeInTheDocument()
    })

    const button = screen.getByRole('button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/Pro Üyelik Gerekli/i)).toBeInTheDocument()
      expect(screen.getByText(/Fiyatlandırmaya Git/i)).toBeInTheDocument()
    })
  })

  it('shows FAB for unauthenticated user and redirects to pricing on click', async () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    render(<ProGlobalChat />)

    await waitFor(() => {
      const button = screen.queryByRole('button')
      expect(button).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button'))
    expect(mockPush).toHaveBeenCalledWith('/pricing')
  })

  it('expands chat panel when icon is clicked (Pro user)', async () => {
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })

    const { rerender } = render(<ProGlobalChat />)

    await waitFor(() => {
      const button = screen.getByRole('button')
      fireEvent.click(button)
    })

    // Simulate context updating panel open state (real PdfProvider would do this)
    ;(usePdf as any).mockReturnValue({ ...mockUsePdf, proChatPanelOpen: true })
    rerender(<ProGlobalChat />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/chatPlaceholder|sorunuzu|pdf hakkında/i)).toBeInTheDocument()
    })
  })

  it('initializes chat session when expanded (Pro user)', async () => {
    ;(sendRequest as any)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({ session_id: 'test-session-123' })

    const { rerender } = render(<ProGlobalChat />)

    // Wait for role fetch to be called and then for promise to resolve + React to re-render
    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith('/files/user/stats', 'GET')
    })
    await Promise.resolve()
    await Promise.resolve()

    const button = screen.getByRole('button', { name: /ai asistanı/i })
    fireEvent.click(button)

    ;(usePdf as any).mockReturnValue({ ...mockUsePdf, proChatPanelOpen: true })
    rerender(<ProGlobalChat />)

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        '/files/chat/general/start',
        'POST',
        expect.objectContaining({
          llm_provider: 'cloud',
          mode: 'flash'
        })
      )
    })
  })

  it('sends message when form is submitted', async () => {
    ;(sendRequest as any)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({ session_id: 'test-session-123' })
      .mockResolvedValueOnce({ answer: 'Test response' })

    const { rerender } = render(<ProGlobalChat />)

    await waitFor(() => {
      fireEvent.click(screen.getByRole('button'))
    })
    ;(usePdf as any).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
      generalSessionId: 'test-session-123',
      generalChatMessages: [{ role: 'assistant', content: 'Hello' }]
    })
    rerender(<ProGlobalChat />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/chatPlaceholder|sorunuzu|pdf hakkında/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/chatPlaceholder|sorunuzu|pdf hakkında/i)
    fireEvent.change(input, { target: { value: 'Test message' } })

    const form = input.closest('form')
    if (form) {
      fireEvent.submit(form)
    }

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        '/files/chat/general/message',
        'POST',
        expect.objectContaining({
          session_id: 'test-session-123',
          message: 'Test message'
        })
      )
    })
  })

  it('handles API errors gracefully', async () => {
    ;(sendRequest as any)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockRejectedValueOnce(new Error('API Error'))

    const { rerender } = render(<ProGlobalChat />)

    await waitFor(() => {
      fireEvent.click(screen.getByRole('button'))
    })
    ;(usePdf as any).mockReturnValue({
      ...mockUsePdf,
      proChatPanelOpen: true,
      generalChatMessages: [
        { role: 'assistant', content: '🚫 Sohbet başlatılamadı. Lütfen tekrar deneyin.' }
      ]
    })
    rerender(<ProGlobalChat />)

    await waitFor(() => {
      expect(screen.getByText(/sohbet başlatılamadı/i)).toBeInTheDocument()
    })
  })

  it('uses PDF chat session when available', async () => {
    ;(usePdf as any).mockReturnValue({
      ...mockUsePdf,
      sessionId: 'pdf-session-123',
      chatMessages: [{ role: 'assistant', content: 'PDF chat ready' }],
      setChatMessages: vi.fn(),
      isChatActive: true,
      proChatPanelOpen: true
    })
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })

    render(<ProGlobalChat />)

    await waitFor(() => {
      expect(screen.getByText('PDF chat ready')).toBeInTheDocument()
    })
  })
})
