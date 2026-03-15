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
