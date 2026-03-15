import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { PdfProvider, usePdf } from '@/context/PdfContext'

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
})

// Helper function to create a mock PDF File
function createMockPdfFile(name = 'test.pdf', size = 1024): File {
  const blob = new Blob(['mock pdf content'], { type: 'application/pdf' })
  return new File([blob], name, { type: 'application/pdf' })
}

// Helper function to create base64 string from File
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

describe('PdfContext', () => {
  beforeEach(() => {
    // Her test öncesi sessionStorage'ı temizle
    sessionStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('Initial State', () => {
    it('should initialize with null pdfFile', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      expect(result.current.pdfFile).toBeNull()
      expect(result.current.refreshKey).toBe(0)
      expect(result.current.chatMessages).toEqual([])
      expect(result.current.isChatActive).toBe(false)
      expect(result.current.sessionId).toBeNull()
    })

    it('should restore PDF from sessionStorage on mount', async () => {
      const mockFile = createMockPdfFile('restored.pdf')
      const base64 = await fileToBase64(mockFile)
      sessionStorageMock.setItem('activePdfBase64', base64)

      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull()
      })

      expect(result.current.pdfFile?.name).toBe('restored_document.pdf')
    })
  })

  describe('savePdf', () => {
    it('should save a PDF file and update state', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const mockFile = createMockPdfFile('document.pdf')

      await act(async () => {
        await result.current.savePdf(mockFile)
      })

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull()
      })

      expect(result.current.pdfFile?.name).toBe('document.pdf')
      expect(result.current.refreshKey).toBeGreaterThan(0)
      expect(sessionStorageMock.getItem('activePdfBase64')).toBeTruthy()
    })

    it('should clear PDF when null is passed', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const mockFile = createMockPdfFile('document.pdf')

      // Önce bir dosya kaydet
      await act(async () => {
        await result.current.savePdf(mockFile)
      })

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull()
      })

      // Sonra null ile temizle
      await act(async () => {
        await result.current.savePdf(null)
      })

      expect(result.current.pdfFile).toBeNull()
      expect(result.current.isChatActive).toBe(false)
      expect(result.current.chatMessages).toEqual([])
      expect(result.current.sessionId).toBeNull()
      expect(sessionStorageMock.getItem('activePdfBase64')).toBeNull()
    })

    it('should increment refreshKey when saving a new file', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const initialRefreshKey = result.current.refreshKey
      const mockFile = createMockPdfFile('document.pdf')

      await act(async () => {
        await result.current.savePdf(mockFile)
      })

      await waitFor(() => {
        expect(result.current.refreshKey).toBeGreaterThan(initialRefreshKey)
      })
    })

    it('should handle files without slice method gracefully', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const invalidFile = {
        name: 'invalid.pdf',
        size: 1024,
        type: 'application/pdf',
      } as unknown as File

      await act(async () => {
        await result.current.savePdf(invalidFile)
      })

      // Should not throw and should resolve
      expect(result.current.pdfFile).toBeNull()
    })
  })

  describe('clearPdf', () => {
    it('should clear PDF file and reset chat state', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const mockFile = createMockPdfFile('document.pdf')

      // Önce bir dosya kaydet
      await act(async () => {
        await result.current.savePdf(mockFile)
      })

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull()
      })

      // Chat state'lerini ayarla
      act(() => {
        result.current.setIsChatActive(true)
        result.current.setChatMessages([{ role: 'user', content: 'Hello' }])
        result.current.setSessionId('session-123')
      })

      // clearPdf'i çağır
      act(() => {
        result.current.clearPdf()
      })

      expect(result.current.pdfFile).toBeNull()
      expect(result.current.isChatActive).toBe(false)
      expect(result.current.chatMessages).toEqual([])
      expect(result.current.sessionId).toBeNull()
      expect(sessionStorageMock.getItem('activePdfBase64')).toBeNull()
    })

    it('should increment refreshKey when clearing PDF', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const mockFile = createMockPdfFile('document.pdf')

      await act(async () => {
        await result.current.savePdf(mockFile)
      })

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull()
      })

      const refreshKeyBeforeClear = result.current.refreshKey

      act(() => {
        result.current.clearPdf()
      })

      expect(result.current.refreshKey).toBeGreaterThan(refreshKeyBeforeClear)
    })
  })

  describe('triggerRefresh', () => {
    it('should increment refreshKey', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const initialRefreshKey = result.current.refreshKey

      act(() => {
        result.current.triggerRefresh()
      })

      expect(result.current.refreshKey).toBe(initialRefreshKey + 1)
    })

    it('should increment refreshKey multiple times', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      act(() => {
        result.current.triggerRefresh()
        result.current.triggerRefresh()
        result.current.triggerRefresh()
      })

      expect(result.current.refreshKey).toBe(3)
    })
  })

  describe('Chat State Management', () => {
    it('should manage chatMessages state', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      const newMessages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
      ]

      act(() => {
        result.current.setChatMessages(newMessages)
      })

      expect(result.current.chatMessages).toEqual(newMessages)
    })

    it('should manage isChatActive state', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      expect(result.current.isChatActive).toBe(false)

      act(() => {
        result.current.setIsChatActive(true)
      })

      expect(result.current.isChatActive).toBe(true)

      act(() => {
        result.current.setIsChatActive(false)
      })

      expect(result.current.isChatActive).toBe(false)
    })

    it('should manage sessionId state', () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      expect(result.current.sessionId).toBeNull()

      act(() => {
        result.current.setSessionId('session-123')
      })

      expect(result.current.sessionId).toBe('session-123')

      act(() => {
        result.current.setSessionId(null)
      })

      expect(result.current.sessionId).toBeNull()
    })

    it('should reset chat state when PDF is cleared', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      // Chat state'lerini ayarla
      act(() => {
        result.current.setIsChatActive(true)
        result.current.setChatMessages([{ role: 'user', content: 'Test' }])
        result.current.setSessionId('session-123')
      })

      // PDF'i temizle
      act(() => {
        result.current.clearPdf()
      })

      expect(result.current.isChatActive).toBe(false)
      expect(result.current.chatMessages).toEqual([])
      expect(result.current.sessionId).toBeNull()
    })
  })

  describe('Error Handling', () => {
    it('should handle sessionStorage errors gracefully', async () => {
      // sessionStorage.getItem'ı mock'la ve hata fırlat
      const originalGetItem = sessionStorageMock.getItem
      sessionStorageMock.getItem = vi.fn(() => {
        throw new Error('Storage error')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      // useEffect'in çalışması için bekle
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
      sessionStorageMock.getItem = originalGetItem
    })

    it('should handle large PDF files that cannot be stored', async () => {
      const { result } = renderHook(() => usePdf(), {
        wrapper: PdfProvider,
      })

      // sessionStorage.setItem'ı mock'la ve hata fırlat
      const originalSetItem = sessionStorageMock.setItem
      sessionStorageMock.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError')
      })

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const mockFile = createMockPdfFile('large.pdf')

      await act(async () => {
        await result.current.savePdf(mockFile)
      })

      await waitFor(() => {
        expect(result.current.pdfFile).not.toBeNull()
      })

      // PDF dosyası kaydedilmeli ama storage hatası loglanmalı
      expect(consoleWarnSpy).toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
      sessionStorageMock.setItem = originalSetItem
    })
  })
})
