import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reorderPdfPages, saveReorderedPdfToServer } from '../useEditPdfApi';

const sendRequest = vi.fn();

vi.mock('@/utils/api', () => ({
  sendRequest: (...args: unknown[]) => sendRequest(...args),
}));

describe('useEditPdfApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reorderPdfPages posts file and page_numbers', async () => {
    const blob = new Blob(['x'], { type: 'application/pdf' });
    sendRequest.mockResolvedValue(blob);
    const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });

    const out = await reorderPdfPages(file, '2,1');

    expect(sendRequest).toHaveBeenCalledTimes(1);
    const [path, method, body, raw] = sendRequest.mock.calls[0];
    expect(path).toBe('/files/reorder');
    expect(method).toBe('POST');
    expect(raw).toBe(true);
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('page_numbers')).toBe('2,1');
    expect(out).toBe(blob);
  });

  it('saveReorderedPdfToServer posts file and filename', async () => {
    const payload = { size_kb: 12 };
    sendRequest.mockResolvedValue(payload);
    const file = new File(['%PDF'], 'out.pdf', { type: 'application/pdf' });

    const out = await saveReorderedPdfToServer(file, 'out.pdf');

    expect(sendRequest).toHaveBeenCalledTimes(1);
    const [path, method, body, raw] = sendRequest.mock.calls[0];
    expect(path).toBe('/files/save-processed');
    expect(method).toBe('POST');
    expect(raw).toBe(true);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('filename')).toBe('out.pdf');
    expect(out).toEqual(payload);
  });
});
