import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSession, signOut } from 'next-auth/react';
import {
  sendRequest,
  swrFetcher,
  fetchChatSessions,
  fetchSessionMessages,
  resumeChatSession,
  fetchStoredPdfBlob,
  getUserDocuments,
} from '../api';

// Mock dependencies
vi.mock('next-auth/react', () => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
}));

describe('sendRequest', () => {
  const originalFetch = global.fetch;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    global.localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.localStorage = originalLocalStorage;
  });

  it('sends GET request successfully', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    const result = await sendRequest('/test', 'GET');

    expect(result).toEqual({ data: 'test' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/test',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('sends POST request with JSON body', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    });

    const result = await sendRequest('/test', 'POST', { key: 'value' });

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ key: 'value' }),
      })
    );
  });

  it('sends request with guest ID header', async () => {
    (getSession as any).mockResolvedValue(null);
    (global.localStorage.getItem as any).mockReturnValue('guest-123');
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    await sendRequest('/test', 'GET');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Guest-ID': 'guest-123',
        }),
      })
    );
  });

  it('sends file upload request', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      blob: async () => new Blob(['pdf content'], { type: 'application/pdf' }),
    });

    const formData = new FormData();
    formData.append('file', new Blob(['test']));

    const result = await sendRequest('/upload', 'POST', formData, true);

    expect(result).toBeInstanceOf(Blob);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: formData,
      })
    );
    // Should not have Content-Type header for file uploads
    const callArgs = (global.fetch as any).mock.calls[0][1];
    expect(callArgs.headers['Content-Type']).toBeUndefined();
  });

  it('handles 401 error and redirects to login', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Unauthorized' }),
    });

    // Mock window.location
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { href: '' } as any;

    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Oturum süreniz dolmuş'
    );

    // signOut should be called
    expect(signOut).toHaveBeenCalledWith({
      callbackUrl: '/login',
      redirect: true,
    });

    // Restore
    (window as unknown as { location: Location }).location = originalLocation;
  });

  it('handles error response with detail string', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Bad request' }),
    });

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Bad request');
  });

  it('handles error response with detail array', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ msg: 'Error 1' }, { msg: 'Error 2' }],
      }),
    });

    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Error 1, Error 2'
    );
  });

  it('handles error response without detail', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Hata: 500');
  });

  it('handles network errors', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Network error');
  });

  it('returns blob for non-JSON responses', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    const blob = new Blob(['binary data'], { type: 'application/pdf' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      blob: async () => blob,
    });

    const result = await sendRequest('/download', 'GET');

    expect(result).toBeInstanceOf(Blob);
  });

  it('works without session token', async () => {
    (getSession as any).mockResolvedValue(null);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });

    const result = await sendRequest('/test', 'GET');

    expect(result).toEqual({ data: 'test' });
    const callArgs = (global.fetch as any).mock.calls[0][1];
    expect(callArgs.headers['Authorization']).toBeUndefined();
  });

  it('handles invalid JSON response gracefully', async () => {
    (getSession as any).mockResolvedValue({
      accessToken: 'test-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(sendRequest('/test', 'GET')).rejects.toThrow('Hata: 500');
  });

  it('maps 503 and 504 to temporary DB message', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    for (const status of [503, 504]) {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => ({}),
      });
      await expect(sendRequest('/test', 'GET')).rejects.toThrow(
        'Veritabanı bağlantısı geçici'
      );
    }
  });

  it('rewrites chat endpoints to app proxy paths', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/files/chat/message', 'POST', { x: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/proxy/chat/message'),
      expect.any(Object)
    );
  });

  it('uses user.accessToken when top-level token missing', async () => {
    (getSession as any).mockResolvedValue({
      user: { accessToken: 'from-user' },
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/x', 'GET');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer from-user',
        }),
      })
    );
  });

  it('throws with stringified detail when detail is an object', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: { nested: true } }),
    });
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      '{"nested":true}'
    );
  });

  it('redirects via window.location when signOut throws on 401', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    (signOut as any).mockRejectedValue(new Error('signOut failed'));
    const hrefSetter = vi.fn();
    const originalDesc = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: '',
        set href(v: string) {
          hrefSetter(v);
        },
        assign: vi.fn(),
      },
    });
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Oturum süreniz dolmuş'
    );
    expect(hrefSetter).toHaveBeenCalledWith('/login');
    if (originalDesc) Object.defineProperty(window, 'location', originalDesc);
  });

  it('maps TypeError fetch failed to temporary DB message', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    const err = new TypeError('fetch failed');
    (global.fetch as any).mockRejectedValue(err);
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Veritabanı bağlantısı geçici'
    );
  });

  it('maps TypeError socket hang up to temporary DB message', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockRejectedValue(new TypeError('socket hang up'));
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Veritabanı bağlantısı geçici'
    );
  });

  it('rethrows TypeError when message does not match network patterns', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    const err = new TypeError('unrelated failure');
    (global.fetch as any).mockRejectedValue(err);
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'unrelated failure'
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uses relative URL when browser is https and API env is http', async () => {
    const prevEnv = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000';
    const prevLoc = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...prevLoc, protocol: 'https:' },
    });
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/only-path', 'GET');
    expect(global.fetch).toHaveBeenCalledWith('/only-path', expect.any(Object));
    process.env.NEXT_PUBLIC_API_URL = prevEnv;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: prevLoc,
    });
  });

  it('maps Error with econnreset message to temporary DB message', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockRejectedValue(new Error('ECONNRESET upstream'));
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Veritabanı bağlantısı geçici'
    );
  });

  it('uses apiToken when accessToken is missing on session', async () => {
    (getSession as any).mockResolvedValue({
      apiToken: 'api-only-token',
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/x', 'GET');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer api-only-token',
        }),
      })
    );
  });

  it('uses user.apiToken when nested token fields are used', async () => {
    (getSession as any).mockResolvedValue({
      user: { apiToken: 'nested-api' },
    });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/x', 'GET');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer nested-api',
        }),
      })
    );
  });

  it('defaults base URL to localhost when env is blank', async () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = '   ';
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/ping', 'GET');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/ping',
      expect.any(Object)
    );
    process.env.NEXT_PUBLIC_API_URL = prev;
  });

  it('rewrites chat start and general start endpoints to proxy', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/files/chat/start', 'POST', {});
    await sendRequest('/files/chat/general/start', 'POST', {});
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/proxy/chat/start'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/proxy/chat/general/start'),
      expect.any(Object)
    );
  });

  it('rewrites chat sessions list and nested session paths to proxy', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ messages: [] }),
    });
    await sendRequest('/files/chat/sessions', 'GET');
    await sendRequest('/files/chat/sessions/abc/messages', 'GET');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/proxy/chat/sessions'),
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/proxy\/chat\/sessions\/abc\/messages$/),
      expect.any(Object)
    );
  });

  it('omits X-Guest-ID header when window is undefined', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    const prevWindow = global.window;
    vi.stubGlobal('window', undefined);
    try {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      await sendRequest('/no-guest', 'GET');
      const headers = (global.fetch as any).mock.calls[0][1].headers;
      expect(headers['X-Guest-ID']).toBeUndefined();
    } finally {
      global.window = prevWindow;
    }
  });

  it('skips signOut on 401 when window is undefined', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const prevWindow = global.window;
    vi.stubGlobal('window', undefined);
    try {
      await expect(sendRequest('/401-nowin', 'GET')).rejects.toThrow(
        'Oturum süreniz dolmuş'
      );
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      global.window = prevWindow;
    }
  });

  it('treats TypeError with empty message like unrelated failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    const err = new TypeError();
    err.message = '';
    (global.fetch as any).mockRejectedValue(err);
    await expect(sendRequest('/test', 'GET')).rejects.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uses empty string when NEXT_PUBLIC_API_URL is undefined', async () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    await sendRequest('/env-undef', 'GET');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/env-undef',
      expect.any(Object)
    );
    process.env.NEXT_PUBLIC_API_URL = prev;
  });

  it('maps TypeError NetworkError to temporary DB message', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockRejectedValue(
      new TypeError('NetworkError when attempting to fetch resource.')
    );
    await expect(sendRequest('/test', 'GET')).rejects.toThrow(
      'Veritabanı bağlantısı geçici'
    );
  });

  it('swrFetcher and file helpers delegate to sendRequest', async () => {
    (getSession as any).mockResolvedValue({ accessToken: 't' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ sessions: [] }),
    });
    await swrFetcher('/files/chat/sessions');
    await fetchChatSessions();
    await fetchSessionMessages('sid');
    await resumeChatSession('sid');
    await getUserDocuments();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      blob: async () => new Blob(['x']),
    });
    await fetchStoredPdfBlob('pid');
    expect(global.fetch.mock.calls.length).toBeGreaterThan(5);
  });
});
