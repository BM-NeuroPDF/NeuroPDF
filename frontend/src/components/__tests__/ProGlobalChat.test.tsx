import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import ProGlobalChat from '../ProGlobalChat'
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

describe('ProGlobalChat', () => {
  const mockSession = {
    user: { name: 'Test User', email: 'test@example.com', id: 'user-123' },
    accessToken: 'test-token'
  }

  const mockUseLanguage = {
    t: (key: string) => key,
    language: 'tr'
  }

  const mockUsePdf = {
    sessionId: null,
    chatMessages: [],
    setChatMessages: vi.fn(),
    isChatActive: false
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSession as any).mockReturnValue({
      data: mockSession,
      status: 'authenticated'
    })
    ;(useLanguage as any).mockReturnValue(mockUseLanguage)
    ;(usePdf as any).mockReturnValue(mockUsePdf)
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })
  })

  it('renders minimized icon when user is Pro', async () => {
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })
    
    render(<ProGlobalChat />)
    
    await waitFor(() => {
      const button = screen.queryByRole('button', { name: /ai chat/i })
      expect(button).toBeInTheDocument()
    })
  })

  it('does not render when user is not Pro', async () => {
    ;(sendRequest as any).mockResolvedValue({ role: 'standard' })
    
    const { container } = render(<ProGlobalChat />)
    
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it('does not render when not authenticated', () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
    
    const { container } = render(<ProGlobalChat />)
    expect(container.firstChild).toBeNull()
  })

  it('expands chat panel when icon is clicked', async () => {
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })
    
    render(<ProGlobalChat />)
    
    await waitFor(() => {
      const button = screen.getByRole('button')
      fireEvent.click(button)
    })
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/pdf hakkında/i)).toBeInTheDocument()
    })
  })

  it('initializes chat session when expanded', async () => {
    ;(sendRequest as any)
      .mockResolvedValueOnce({ role: 'pro' })
      .mockResolvedValueOnce({ session_id: 'test-session-123' })
    
    render(<ProGlobalChat />)
    
    await waitFor(() => {
      const button = screen.getByRole('button')
      fireEvent.click(button)
    })
    
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
    
    render(<ProGlobalChat />)
    
    // Expand chat
    await waitFor(() => {
      const button = screen.getByRole('button')
      fireEvent.click(button)
    })
    
    // Wait for session to initialize
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/pdf hakkında/i)).toBeInTheDocument()
    })
    
    // Type message
    const input = screen.getByPlaceholderText(/pdf hakkında/i)
    fireEvent.change(input, { target: { value: 'Test message' } })
    
    // Submit form
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
    
    render(<ProGlobalChat />)
    
    await waitFor(() => {
      const button = screen.getByRole('button')
      fireEvent.click(button)
    })
    
    await waitFor(() => {
      expect(screen.getByText(/sohbet başlatılamadı/i)).toBeInTheDocument()
    })
  })

  it('uses PDF chat session when available', async () => {
    ;(usePdf as any).mockReturnValue({
      sessionId: 'pdf-session-123',
      chatMessages: [{ role: 'assistant', content: 'PDF chat ready' }],
      setChatMessages: vi.fn(),
      isChatActive: true
    })
    ;(sendRequest as any).mockResolvedValue({ role: 'pro' })
    
    render(<ProGlobalChat />)
    
    await waitFor(() => {
      const button = screen.getByRole('button')
      fireEvent.click(button)
    })
    
    await waitFor(() => {
      expect(screen.getByText('PDF chat ready')).toBeInTheDocument()
    })
  })
})
