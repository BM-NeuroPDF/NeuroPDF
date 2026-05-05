import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getGuestId = vi.fn().mockResolvedValue('guest-x');
const incrementUsage = vi.fn().mockResolvedValue({});

vi.mock('../guestService', () => ({
  guestService: {
    getGuestId,
    incrementUsage,
  },
}));

describe('pdfService', () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getGuestId.mockResolvedValue('guest-x');
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();
    const link = document.createElement('a');
    link.click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(link as HTMLAnchorElement);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('upload sends FormData with auth token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'a.pdf', size_kb: 1, temp_id: 't1' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    const r = await pdfService.upload(file, 'tok');
    expect(r.temp_id).toBe('t1');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/files/upload'),
      expect.objectContaining({ method: 'POST' }),
    );
    const call = fetchMock.mock.calls[0];
    expect(call[1].headers['Authorization']).toBe('Bearer tok');
  });

  it('upload throws on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'bad' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(pdfService.upload(file)).rejects.toThrow('bad');
  });

  it('upload throws status message when error JSON is empty', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(pdfService.upload(file, null)).rejects.toThrow('Upload failed: 502');
  });

  it('convertToText downloads blob and increments guest usage', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['txt'], { type: 'text/plain' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await pdfService.convertToText(file, null);
    vi.advanceTimersByTime(150);
    expect(incrementUsage).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('convertToText throws status message when error JSON is null', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('bad');
      },
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await expect(pdfService.convertToText(file, null)).rejects.toThrow('Conversion failed: 503');
  });

  it('convertToText throws when response not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'conv bad' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await expect(pdfService.convertToText(file, 'tok')).rejects.toThrow('conv bad');
  });

  it('convertToText skips increment when logged in', async () => {
    vi.useFakeTimers();
    incrementUsage.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['txt']),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await pdfService.convertToText(file, 'token');
    vi.advanceTimersByTime(150);
    expect(incrementUsage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('convertToText logs when incrementUsage fails for guest', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    incrementUsage.mockRejectedValueOnce(new Error('increment failed'));
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['txt']),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await pdfService.convertToText(file, null);
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('mergePDFs does not increment usage when logged in', async () => {
    vi.useFakeTimers();
    incrementUsage.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    await pdfService.mergePDFs(files, 'tok');
    vi.advanceTimersByTime(150);
    expect(incrementUsage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('extractPages throws on failed response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'extract bad' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await expect(pdfService.extractPages(file, '1-2', null)).rejects.toThrow('extract bad');
  });

  it('mergePDFs throws status message when error JSON is null', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('bad');
      },
    });
    const { pdfService } = await import('../pdfService');
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    await expect(pdfService.mergePDFs(files, null)).rejects.toThrow('Merge failed: 503');
  });

  it('extractPages throws status message when error JSON is null', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('bad');
      },
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await expect(pdfService.extractPages(file, '1', null)).rejects.toThrow(
      'Extraction failed: 502',
    );
  });

  it('saveProcessed throws status message when error JSON is null', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('bad');
      },
    });
    const { pdfService } = await import('../pdfService');
    await expect(pdfService.saveProcessed(new Blob(['x']), 'out.pdf', 'tok')).rejects.toThrow(
      'Save failed: 400',
    );
  });

  it('createPdfFromMarkdown throws status when error JSON is null', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 418,
      json: async () => {
        throw new Error('bad');
      },
    });
    const { pdfService } = await import('../pdfService');
    await expect(pdfService.createPdfFromMarkdown('# x', 's.pdf', null)).rejects.toThrow(
      'Markdown PDF failed: 418',
    );
  });

  it('mergePDFs throws on failed response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'merge bad' }),
    });
    const { pdfService } = await import('../pdfService');
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    await expect(pdfService.mergePDFs(files, null)).rejects.toThrow('merge bad');
  });

  it('extractPages does not increment guest usage when logged in', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await pdfService.extractPages(file, '1-2', 'tok');
    vi.advanceTimersByTime(150);
    expect(incrementUsage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('extractPages logs when guest increment fails', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    incrementUsage.mockRejectedValueOnce(new Error('inc'));
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await pdfService.extractPages(file, '1-2', null);
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('mergePDFs logs when guest increment fails', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    incrementUsage.mockRejectedValueOnce(new Error('inc'));
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    await pdfService.mergePDFs(files, null);
    vi.advanceTimersByTime(150);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('extractPages and mergePDFs call download and increment for guest', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await pdfService.extractPages(file, '1-2', null);
    vi.advanceTimersByTime(150);
    const files = [
      new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      new File(['b'], 'b.pdf', { type: 'application/pdf' }),
    ];
    await pdfService.mergePDFs(files, null);
    vi.advanceTimersByTime(150);
    expect(incrementUsage.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it('saveProcessed throws without token', async () => {
    const { pdfService } = await import('../pdfService');
    await expect(pdfService.saveProcessed(new Blob(), 'f.pdf', null)).rejects.toThrow('logged in');
  });

  it('saveProcessed posts file when token present', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const { pdfService } = await import('../pdfService');
    const r = await pdfService.saveProcessed(new Blob(['x']), 'out.pdf', 'tok');
    expect(r).toEqual({ ok: true });
  });

  it('saveProcessed throws on failed response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'save bad' }),
    });
    const { pdfService } = await import('../pdfService');
    await expect(pdfService.saveProcessed(new Blob(['x']), 'out.pdf', 'tok')).rejects.toThrow(
      'save bad',
    );
  });

  it('createPdfFromMarkdown downloads pdf blob', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    await pdfService.createPdfFromMarkdown('# Hi', 'summary.pdf', null);
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
  });

  it('createPdfFromMarkdown throws on error response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'nope' }),
    });
    const { pdfService } = await import('../pdfService');
    await expect(pdfService.createPdfFromMarkdown('# x', 's.pdf', null)).rejects.toThrow('nope');
  });

  it('createPdfFromMarkdown appends .pdf when filename has no extension', async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const link = document.createElement('a');
    link.click = click;
    vi.spyOn(document, 'createElement').mockReturnValue(link as HTMLAnchorElement);
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    });
    const { pdfService } = await import('../pdfService');
    await pdfService.createPdfFromMarkdown('# Title', 'noext', null);
    vi.advanceTimersByTime(150);
    expect(click).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('uses localhost when env is unset and page is http', async () => {
    const prevEnv = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.resetModules();
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:' },
      configurable: true,
      writable: true,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'a.pdf', size_kb: 1, temp_id: 't1' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await pdfService.upload(file, null);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/files/upload',
      expect.any(Object),
    );
    process.env.NEXT_PUBLIC_API_URL = prevEnv;
  });

  it('uses relative API base on https page with http env', async () => {
    const prev = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000';
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:' },
      writable: true,
      configurable: true,
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'a.pdf', size_kb: 1, temp_id: 't1' }),
    });
    const { pdfService } = await import('../pdfService');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await pdfService.upload(file, null);
    expect(global.fetch).toHaveBeenCalledWith('/files/upload', expect.any(Object));
    process.env.NEXT_PUBLIC_API_URL = prev;
  });
});
