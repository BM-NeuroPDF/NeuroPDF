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
    ;(window as unknown as { location: Location }).location = originalLocation
  })
})
