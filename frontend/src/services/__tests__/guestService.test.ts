import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('guestService', () => {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.window = originalWindow;
    localStorage.clear();
  });

  it('initializeGuestId reads localStorage when window exists', async () => {
    localStorage.setItem('guest_id', 'g1');
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    expect(guestService.getCurrentGuestId()).toBe('g1');
  });

  it('createSession stores guest_id on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        guest_id: 'new-guest',
        usage_count: 0,
        remaining_usage: 5,
        max_usage: 5,
      }),
    });
    const { guestService } = await import('../guestService');
    const data = await guestService.createSession();
    expect(data.guest_id).toBe('new-guest');
    expect(localStorage.getItem('guest_id')).toBe('new-guest');
  });

  it('createSession throws when response not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'err',
    });
    const { guestService } = await import('../guestService');
    await expect(guestService.createSession()).rejects.toThrow(
      'Failed to create guest session'
    );
  });

  it('getGuestId creates session when missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        guest_id: 'auto',
        usage_count: 0,
        remaining_usage: 5,
        max_usage: 5,
      }),
    });
    const { guestService } = await import('../guestService');
    const id = await guestService.getGuestId();
    expect(id).toBe('auto');
  });

  it('getGuestId uses localStorage without creating session', async () => {
    localStorage.setItem('guest_id', 'from-storage');
    const { guestService } = await import('../guestService');
    const id = await guestService.getGuestId();
    expect(id).toBe('from-storage');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('checkUsage returns JSON on success', async () => {
    localStorage.setItem('guest_id', 'g-check');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        can_use: true,
        usage_count: 1,
        remaining_usage: 4,
        message: 'ok',
      }),
    });
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    const r = await guestService.checkUsage();
    expect(r.can_use).toBe(true);
  });

  it('checkUsage throws when not ok', async () => {
    localStorage.setItem('guest_id', 'g1');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad',
    });
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    await expect(guestService.checkUsage()).rejects.toThrow(
      'Failed to check usage'
    );
  });

  it('incrementUsage throws on error body', async () => {
    localStorage.setItem('guest_id', 'g1');
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'limit' }),
    });
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    await expect(guestService.incrementUsage()).rejects.toThrow('limit');
  });

  it('incrementUsage falls back when response not ok and detail missing', async () => {
    localStorage.setItem('guest_id', 'g1');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    await expect(guestService.incrementUsage()).rejects.toThrow(
      'Usage limit reached'
    );
  });

  it('incrementUsage returns on success', async () => {
    localStorage.setItem('guest_id', 'g1');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        can_use: true,
        usage_count: 2,
        remaining_usage: 3,
        message: 'ok',
      }),
    });
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    const r = await guestService.incrementUsage();
    expect(r.usage_count).toBe(2);
  });

  it('clearSession clears local state', async () => {
    localStorage.setItem('guest_id', 'g-clear');
    fetchMock.mockResolvedValue({ ok: true });
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    await guestService.clearSession();
    expect(localStorage.getItem('guest_id')).toBeNull();
    expect(guestService.getCurrentGuestId()).toBeNull();
  });

  it('clearSession no-op when no guest id', async () => {
    const { guestService } = await import('../guestService');
    await guestService.clearSession();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('isLoggedIn returns false in browser', async () => {
    const { guestService } = await import('../guestService');
    expect(guestService.isLoggedIn()).toBe(false);
  });

  it('uses localhost when NEXT_PUBLIC_API_URL is unset', async () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.resetModules();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        guest_id: 'from-default-base',
        usage_count: 0,
        remaining_usage: 5,
        max_usage: 5,
      }),
    });
    const { guestService } = await import('../guestService');
    await guestService.createSession();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/guest/session',
      expect.any(Object)
    );
    process.env.NEXT_PUBLIC_API_URL = prev;
  });

  it('initializeGuestId is a no-op without window', async () => {
    const w = global.window;
    vi.stubGlobal('window', undefined);
    vi.resetModules();
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    expect(guestService.getCurrentGuestId()).toBeNull();
    vi.stubGlobal('window', w);
  });

  it('isLoggedIn returns false without window', async () => {
    const w = global.window;
    vi.stubGlobal('window', undefined);
    vi.resetModules();
    const { guestService } = await import('../guestService');
    expect(guestService.isLoggedIn()).toBe(false);
    vi.stubGlobal('window', w);
  });

  it('clearSession swallows fetch errors', async () => {
    localStorage.setItem('guest_id', 'g-err');
    fetchMock.mockRejectedValue(new Error('network'));
    const { guestService } = await import('../guestService');
    guestService.initializeGuestId();
    await expect(guestService.clearSession()).resolves.toBeUndefined();
  });
});
