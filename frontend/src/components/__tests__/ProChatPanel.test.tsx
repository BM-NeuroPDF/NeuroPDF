import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProChatPanel from '../ProChatPanel'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />
}))

describe('ProChatPanel (presentational)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    messages: [],
    onSend: vi.fn(),
    loading: false,
    initializing: false,
    input: '',
    setInput: vi.fn(),
    headerTitle: 'Neuro AI',
    avatarSrc: null,
    userName: 'Test User'
  }

  it('renders when open', () => {
    render(<ProChatPanel {...defaultProps} />)
    expect(screen.getByText('Neuro AI')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/sorunuzu/i)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const { container } = render(<ProChatPanel {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('Neuro AI')).not.toBeInTheDocument()
  })

  it('displays messages', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        messages={[
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ]}
      />
    )
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<ProChatPanel {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('chat-panel-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls setInput when typing', () => {
    const setInput = vi.fn()
    render(<ProChatPanel {...defaultProps} setInput={setInput} />)
    const input = screen.getByPlaceholderText(/sorunuzu/i)
    fireEvent.change(input, { target: { value: 'Test' } })
    expect(setInput).toHaveBeenCalledWith('Test')
  })

  it('calls onSend when form is submitted', () => {
    const onSend = vi.fn()
    render(
      <ProChatPanel {...defaultProps} input="Hello" setInput={vi.fn()} onSend={onSend} />
    )
    const form = screen.getByPlaceholderText(/sorunuzu/i).closest('form')
    if (form) {
      fireEvent.submit(form)
    }
    expect(onSend).toHaveBeenCalled()
  })

  it('shows initializing state', () => {
    render(<ProChatPanel {...defaultProps} initializing={true} />)
    expect(screen.getByText(/başlatılıyor/i)).toBeInTheDocument()
  })

  it('shows loading (typing) label', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        loading={true}
        typingLabel="AI is typing..."
      />
    )
    expect(screen.getByText('AI is typing...')).toBeInTheDocument()
  })

  it('shows headerSubtitle when provided', () => {
    render(
      <ProChatPanel
        {...defaultProps}
        headerSubtitle="PDF AI Asistanı"
      />
    )
    expect(screen.getByText('PDF AI Asistanı')).toBeInTheDocument()
  })

  it('shows custom placeholder', () => {
    render(
      <ProChatPanel {...defaultProps} placeholder="Ask about your PDF..." />
    )
    expect(screen.getByPlaceholderText('Ask about your PDF...')).toBeInTheDocument()
  })

  it('disables input when loading or initializing', () => {
    const { rerender } = render(<ProChatPanel {...defaultProps} />)
    expect(screen.getByPlaceholderText(/sorunuzu/i)).not.toBeDisabled()

    rerender(<ProChatPanel {...defaultProps} loading={true} />)
    expect(screen.getByPlaceholderText(/sorunuzu/i)).toBeDisabled()

    rerender(<ProChatPanel {...defaultProps} loading={false} initializing={true} />)
    expect(screen.getByPlaceholderText(/sorunuzu/i)).toBeDisabled()
  })
})
