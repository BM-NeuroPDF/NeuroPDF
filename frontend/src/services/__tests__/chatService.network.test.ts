import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postGeneralChatMessage, postGeneralChatStart, streamPdfChatMessage } from '../chatService';
import { sendRequest, streamSsePost } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  sendRequest: vi.fn(),
  streamSsePost: vi.fn(),
}));

const mockedSend = vi.mocked(sendRequest);
const mockedStream = vi.mocked(streamSsePost);

describe('chatService (network)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('postGeneralChatMessage delegates to sendRequest', async () => {
    mockedSend.mockResolvedValue({ answer: 'hi' });
    const body = { session_id: 's1', message: 'm', language: 'tr' };
    const r = await postGeneralChatMessage(body);
    expect(mockedSend).toHaveBeenCalledWith('/files/chat/general/message', 'POST', body);
    expect(r).toEqual({ answer: 'hi' });
  });

  it('postGeneralChatStart delegates to sendRequest', async () => {
    mockedSend.mockResolvedValue({ session_id: 'new' });
    const body = { llm_provider: 'cloud', mode: 'flash', language: 'tr' };
    const r = await postGeneralChatStart(body);
    expect(mockedSend).toHaveBeenCalledWith('/files/chat/general/start', 'POST', body);
    expect(r).toEqual({ session_id: 'new' });
  });

  it('streamPdfChatMessage uses proxy stream path', async () => {
    mockedStream.mockResolvedValue(undefined);
    const body = { session_id: 's', message: 'x', language: 'tr' };
    const onEvt = vi.fn();
    await streamPdfChatMessage(body, onEvt, undefined);
    expect(mockedStream).toHaveBeenCalledWith(
      '/api/proxy/chat/message/stream',
      body,
      onEvt,
      undefined,
    );
  });
});
