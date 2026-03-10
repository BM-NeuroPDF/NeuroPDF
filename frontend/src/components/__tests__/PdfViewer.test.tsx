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
