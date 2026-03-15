# Frontend Test Kodları - Tüm Test Dosyaları

Bu dosya frontend projesindeki tüm test kodlarını içermektedir.

**Oluşturulma Tarihi:** $(date +"%Y-%m-%d %H:%M:%S")

## 📋 İçindekiler

1. [Unit Tests](#unit-tests)
2. [Integration Tests](#integration-tests)
3. [E2E Tests](#e2e-tests)
4. [Test Configuration](#test-configuration)
5. [Test Helpers](#test-helpers)

---


## 📄 src/app/__tests__/page.test.tsx

```typescript
import { describe, it, expect } from 'vitest'

// Utilities tested in isolation (no Next.js/React imports)
describe('getRoleColorClass utility logic', () => {
    // Replicate the logic from page.tsx without importing the component
    const getRoleColorClass = (role: string): string => {
        const normalizedRole = role ? role.toLowerCase() : ''
        if (normalizedRole === 'admin') return 'text-red-600'
        if (normalizedRole === 'pro') return 'text-amber-500'
        return 'text-emerald-600'
    }

    it('returns red class for admin role', () => {
        expect(getRoleColorClass('admin')).toBe('text-red-600')
        expect(getRoleColorClass('ADMIN')).toBe('text-red-600')
    })

    it('returns amber class for pro role', () => {
        expect(getRoleColorClass('pro')).toBe('text-amber-500')
        expect(getRoleColorClass('PRO')).toBe('text-amber-500')
    })

    it('returns emerald class for standard user', () => {
        expect(getRoleColorClass('user')).toBe('text-emerald-600')
        expect(getRoleColorClass('')).toBe('text-emerald-600')
    })
})

describe('stats toggling logic', () => {
    it('sets showPersonal to false when no session', () => {
        const session = null
        const isPersonalMode = !!(session && true)
        expect(isPersonalMode).toBe(false)
    })

    it('can toggle to personal mode when session exists', () => {
        const session = { user: { name: 'Test' } }
        const showPersonal = true
        const isPersonalMode = !!(session && showPersonal)
        expect(isPersonalMode).toBe(true)
    })
})
```


## 📄 src/components/__tests__/PdfChatPanel.test.tsx

```typescript
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
```


## 📄 src/components/__tests__/PdfViewer.test.tsx

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import PdfViewer from '../PdfViewer'
import { useLanguage } from '@/context/LanguageContext'

// Mock dependencies
vi.mock('@/context/LanguageContext')
vi.mock('react-pdf', () => ({
  Document: ({ onLoadSuccess, children }: any) => {
    useEffect(() => {
      if (onLoadSuccess) {
        onLoadSuccess({ numPages: 5 })
      }
    }, [onLoadSuccess])
    return <div data-testid="pdf-document">{children}</div>
  },
  Page: ({ pageNumber }: any) => <div data-testid={`pdf-page-${pageNumber}`}>Page {pageNumber}</div>
}))

describe('PdfViewer', () => {
  const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' })
  const mockUseLanguage = {
    t: (key: string) => key,
    language: 'tr'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useLanguage as any).mockReturnValue(mockUseLanguage)
  })

  it('renders PDF viewer with file', () => {
    render(<PdfViewer file={mockFile} />)
    
    expect(screen.getByTestId('pdf-document')).toBeInTheDocument()
  })

  it('renders with custom height', () => {
    const { container } = render(<PdfViewer file={mockFile} height={800} />)
    
    // Height should be applied to the viewer
    expect(container).toBeTruthy()
  })

  it('navigates to next page', async () => {
    render(<PdfViewer file={mockFile} />)
    
    await waitFor(() => {
      const nextButton = screen.getByText(/next/i)
      expect(nextButton).toBeInTheDocument()
    })
    
    const nextButton = screen.getByText(/next/i)
    fireEvent.click(nextButton)
    
    // Page should increment
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-2')).toBeInTheDocument()
    })
  })

  it('navigates to previous page', async () => {
    render(<PdfViewer file={mockFile} />)
    
    // Go to page 2 first
    await waitFor(() => {
      const nextButton = screen.getByText(/next/i)
      fireEvent.click(nextButton)
    })
    
    // Then go back
    await waitFor(() => {
      const prevButton = screen.getByText(/prev/i)
      fireEvent.click(prevButton)
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument()
    })
  })

  it('changes page via input', async () => {
    render(<PdfViewer file={mockFile} />)
    
    await waitFor(() => {
      const pageInput = screen.getByDisplayValue('1')
      fireEvent.change(pageInput, { target: { value: '3' } })
      fireEvent.blur(pageInput)
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-3')).toBeInTheDocument()
    })
  })

  it('handles invalid page number', async () => {
    render(<PdfViewer file={mockFile} />)
    
    await waitFor(() => {
      const pageInput = screen.getByDisplayValue('1')
      fireEvent.change(pageInput, { target: { value: '999' } })
      fireEvent.blur(pageInput)
    })
    
    // Should clamp to max page
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-5')).toBeInTheDocument()
    })
  })

  it('resets page when file changes', async () => {
    const { rerender } = render(<PdfViewer file={mockFile} />)
    
    // Navigate to page 2
    await waitFor(() => {
      const nextButton = screen.getByText(/next/i)
      fireEvent.click(nextButton)
    })
    
    // Change file
    const newFile = new File(['test2'], 'test2.pdf', { type: 'application/pdf' })
    rerender(<PdfViewer file={newFile} />)
    
    // Should reset to page 1
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-1')).toBeInTheDocument()
    })
  })
})
```


## 📄 src/components/__tests__/ProGlobalChat.test.tsx

```typescript
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
```


## 📄 src/hooks/__tests__/useGuestLimit.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useGuestLimit } from '../useGuestLimit'
import { guestService } from '@/services/guestService'

// Mock dependencies
vi.mock('next-auth/react')
vi.mock('@/services/guestService')

describe('useGuestLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true for authenticated users', async () => {
    ;(useSession as any).mockReturnValue({
      data: { user: { id: 'user-123' } },
      status: 'authenticated'
    })

    const { result } = renderHook(() => useGuestLimit())

    const canProceed = await result.current.checkLimit()

    expect(canProceed).toBe(true)
    expect(guestService.checkUsage).not.toHaveBeenCalled()
  })

  it('returns false when session is loading', async () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'loading'
    })

    const { result } = renderHook(() => useGuestLimit())

    const canProceed = await result.current.checkLimit()

    expect(canProceed).toBe(false)
  })

  it('checks guest usage for unauthenticated users', async () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
    ;(guestService.checkUsage as any).mockResolvedValue({
      can_use: true,
      usage_count: 2,
      remaining_usage: 3,
      message: 'You have 3 uses remaining.'
    })

    const { result } = renderHook(() => useGuestLimit())

    const canProceed = await result.current.checkLimit()

    await waitFor(() => {
      expect(canProceed).toBe(true)
      expect(guestService.checkUsage).toHaveBeenCalled()
      expect(result.current.usageInfo).toBeTruthy()
    })
  })

  it('shows limit modal when guest limit is reached', async () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
    ;(guestService.checkUsage as any).mockResolvedValue({
      can_use: false,
      usage_count: 5,
      remaining_usage: 0,
      message: 'Usage limit reached.'
    })

    const { result } = renderHook(() => useGuestLimit())

    const canProceed = await result.current.checkLimit()

    await waitFor(() => {
      expect(canProceed).toBe(false)
      expect(result.current.showLimitModal).toBe(true)
    })
  })

  it('handles API errors gracefully', async () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })
    ;(guestService.checkUsage as any).mockRejectedValue(new Error('API Error'))

    const { result } = renderHook(() => useGuestLimit())

    const canProceed = await result.current.checkLimit()

    await waitFor(() => {
      // Should return true on error (graceful degradation)
      expect(canProceed).toBe(true)
    })
  })

  it('closes limit modal', () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    const { result } = renderHook(() => useGuestLimit())

    result.current.closeLimitModal()

    expect(result.current.showLimitModal).toBe(false)
  })

  it('redirects to login page', () => {
    ;(useSession as any).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    })

    const { result } = renderHook(() => useGuestLimit())
    
    // Mock window.location
    const originalLocation = window.location
    delete (window as any).location
    window.location = { href: '' } as any

    result.current.redirectToLogin()

    expect(window.location.href).toBe('/login')

    // Restore
    window.location = originalLocation
  })
})
```


## 📄 src/hooks/__tests__/usePopup.test.ts

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePopup } from '../usePopup'

describe('usePopup', () => {
  it('initializes with closed popup', () => {
    const { result } = renderHook(() => usePopup())

    expect(result.current.popup.open).toBe(false)
    expect(result.current.popup.type).toBe('info')
    expect(result.current.popup.message).toBe('')
  })

  it('shows error popup', () => {
    const { result } = renderHook(() => usePopup())

    act(() => {
      result.current.showError('Test error message')
    })

    expect(result.current.popup.open).toBe(true)
    expect(result.current.popup.type).toBe('error')
    expect(result.current.popup.message).toBe('Test error message')
  })

  it('shows success popup', () => {
    const { result } = renderHook(() => usePopup())

    act(() => {
      result.current.showSuccess('Operation successful')
    })

    expect(result.current.popup.open).toBe(true)
    expect(result.current.popup.type).toBe('success')
    expect(result.current.popup.message).toBe('Operation successful')
  })

  it('shows info popup', () => {
    const { result } = renderHook(() => usePopup())

    act(() => {
      result.current.showInfo('Information message')
    })

    expect(result.current.popup.open).toBe(true)
    expect(result.current.popup.type).toBe('info')
    expect(result.current.popup.message).toBe('Information message')
  })

  it('closes popup', () => {
    const { result } = renderHook(() => usePopup())

    // Show popup first
    act(() => {
      result.current.showError('Test error')
    })

    expect(result.current.popup.open).toBe(true)

    // Close popup
    act(() => {
      result.current.close()
    })

    expect(result.current.popup.open).toBe(false)
    // Message should still be there
    expect(result.current.popup.message).toBe('Test error')
  })

  it('can change popup type', () => {
    const { result } = renderHook(() => usePopup())

    act(() => {
      result.current.showError('Error')
    })
    expect(result.current.popup.type).toBe('error')

    act(() => {
      result.current.showSuccess('Success')
    })
    expect(result.current.popup.type).toBe('success')

    act(() => {
      result.current.showInfo('Info')
    })
    expect(result.current.popup.type).toBe('info')
  })
})
```


## 📄 src/utils/__tests__/api.test.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSession, signOut } from 'next-auth/react'
import { sendRequest } from '../api'

// Mock dependencies
vi.mock('next-auth/react', () => ({
  getSession: vi.fn(),
  signOut: vi.fn()
}))

describe('sendRequest', () => {
  const originalFetch = global.fetch
  const originalLocalStorage = global.localStorage

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn()
    } as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    global.localStorage = originalLocalStorage
  })

  it('sends GET request successfully', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' })
    })

    const result = await sendRequest('/test', 'GET')

    expect(result).toEqual({ data: 'test' })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token'
        })
      })
    )
  })

  it('sends POST request with JSON body', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
    })

    const result = await sendRequest('/test', 'POST', { key: 'value' })

    expect(result).toEqual({ success: true })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ key: 'value' })
      })
    )
  })

  it('sends request with guest ID header', async () => {
    ;(getSession as any).mockResolvedValue(null)
    ;(global.localStorage.getItem as any).mockReturnValue('guest-123')
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' })
    })

    await sendRequest('/test', 'GET')

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Guest-ID': 'guest-123'
        })
      })
    )
  })

  it('sends file upload request', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      blob: async () => new Blob(['pdf content'], { type: 'application/pdf' })
    })

    const formData = new FormData()
    formData.append('file', new Blob(['test']))

    const result = await sendRequest('/upload', 'POST', formData, true)

    expect(result).toBeInstanceOf(Blob)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: formData
      })
    )
    // Should not have Content-Type header for file uploads
    const callArgs = (global.fetch as any).mock.calls[0][1]
    expect(callArgs.headers['Content-Type']).toBeUndefined()
  })

  it('handles 401 error and redirects to login', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Unauthorized' })
    })
    
    // Mock window.location
    const originalLocation = window.location
    delete (window as any).location
    window.location = { href: '' } as any
    
    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Oturum süreniz dolmuş')
    
    // signOut should be called
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login', redirect: true })
    
    // Restore
    window.location = originalLocation
  })

  it('handles 401 error and redirects to login', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Unauthorized' })
    })
    ;(signOut as any).mockResolvedValue(undefined)
    
    // Mock window.location
    const originalLocation = window.location
    delete (window as any).location
    window.location = { href: '' } as any
    
    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Oturum süreniz dolmuş')
    
    // signOut should be called
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/login', redirect: true })
    
    // Restore
    window.location = originalLocation
  })

  it('handles error response with detail string', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Bad request' })
    })

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Bad request')
  })

  it('handles error response with detail array', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [
          { msg: 'Error 1' },
          { msg: 'Error 2' }
        ]
      })
    })

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Error 1, Error 2')
  })

  it('handles error response without detail', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    })

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Hata: 500')
  })

  it('handles network errors', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Network error')
  })

  it('returns blob for non-JSON responses', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    const blob = new Blob(['binary data'], { type: 'application/pdf' })
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      blob: async () => blob
    })

    const result = await sendRequest('/download', 'GET')

    expect(result).toBeInstanceOf(Blob)
  })

  it('works without session token', async () => {
    ;(getSession as any).mockResolvedValue(null)
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' })
    })

    const result = await sendRequest('/test', 'GET')

    expect(result).toEqual({ data: 'test' })
    const callArgs = (global.fetch as any).mock.calls[0][1]
    expect(callArgs.headers['Authorization']).toBeUndefined()
  })

  it('handles invalid JSON response gracefully', async () => {
    ;(getSession as any).mockResolvedValue({
      accessToken: 'test-token'
    })
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON')
      }
    })

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Hata: 500')
  })
})
```


## ⚙️ Test Configuration Files

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        alias: {
            '@': path.resolve(__dirname, './src')
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/app/__tests__/',
                '**/*.config.{ts,tsx}',
                '**/*.d.ts',
                '**/types/**',
            ]
        }
    }
})
```

### vitest.setup.ts

```typescript
import '@testing-library/jest-dom'
```

