import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import PdfChatPanel from '../PdfChatPanel'
import { useLanguage } from '@/context/LanguageContext'
import { usePdf } from '@/context/PdfContext'
import { sendRequest } from '@/utils/api'

// Mock dependencies
vi.mock('next-auth/react')
vi.mock('@/context/LanguageContext')
vi.mock('@/context/PdfContext')
vi.mock('@/utils/api')
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}))

describe('PdfChatPanel', () => {
  const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
  const mockSession = {
    user: { name: 'Test User', email: 'test@example.com', id: 'user-123' },
    accessToken: 'test-token'
  }

  const mockUseLanguage = {
    t: (key: string) => key,
    language: 'tr'
  }

  const mockUsePdf = {
    chatMessages: [],
    setChatMessages: vi.fn(),
    sessionId: null,
    setSessionId: vi.fn(),
    setIsChatActive: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSession as any).mockReturnValue({
      data: mockSession,
      status: 'authenticated'
    })
    ;(useLanguage as any).mockReturnValue(mockUseLanguage)
    ;(usePdf as any).mockReturnValue(mockUsePdf)
  })

  it('renders chat panel when open', () => {
    render(<PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByPlaceholderText(/pdf hakkında/i)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const { container } = render(<PdfChatPanel file={mockFile} isOpen={false} onClose={vi.fn()} />)
    
    expect(container.firstChild).toBeNull()
  })

  it('initializes chat session when opened', async () => {
    ;(sendRequest as any).mockResolvedValue({ session_id: 'test-session-123' })
    
    render(<PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />)
    
    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        '/files/chat/start',
        'POST',
        expect.any(FormData)
      )
    })
  })

  it('sends PDF chat message', async () => {
    ;(usePdf as any).mockReturnValue({
      ...mockUsePdf,
      sessionId: 'test-session-123',
      chatMessages: []
    })
    ;(sendRequest as any).mockResolvedValue({ answer: 'Test response' })
    
    render(<PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />)
    
    const input = screen.getByPlaceholderText(/pdf hakkında/i)
    fireEvent.change(input, { target: { value: 'Test message' } })
    
    const form = input.closest('form')
    if (form) {
      fireEvent.submit(form)
    }
    
    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith(
        '/files/chat/message',
        'POST',
        expect.objectContaining({
          session_id: 'test-session-123',
          message: 'Test message'
        })
      )
    })
  })

  it('displays PDF context in messages', () => {
    ;(usePdf as any).mockReturnValue({
      ...mockUsePdf,
      sessionId: 'test-session-123',
      chatMessages: [
        { role: 'assistant', content: 'PDF analiz edildi' }
      ]
    })
    
    render(<PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByText('PDF analiz edildi')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<PdfChatPanel file={mockFile} isOpen={true} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)
    
    expect(onClose).toHaveBeenCalled()
  })

  it('handles API errors gracefully', async () => {
    ;(usePdf as any).mockReturnValue({
      ...mockUsePdf,
      sessionId: 'test-session-123'
    })
    ;(sendRequest as any).mockRejectedValue(new Error('API Error'))
    
    render(<PdfChatPanel file={mockFile} isOpen={true} onClose={vi.fn()} />)
    
    const input = screen.getByPlaceholderText(/pdf hakkında/i)
    fireEvent.change(input, { target: { value: 'Test' } })
    
    const form = input.closest('form')
    if (form) {
      fireEvent.submit(form)
    }
    
    await waitFor(() => {
      expect(screen.getByText(/bağlantı hatası/i)).toBeInTheDocument()
    })
  })
})
