import { mbToBytes } from '@/app/config/fileLimits';
import {
  sendRequest,
  streamSsePost,
  type ChatGeneralStartResponse,
  type ChatMessagePostResponse,
  type SendRequestJsonBody,
  type SseEvent,
} from '@/utils/api';

export type ChatPanelPdfValidation =
  | { ok: true }
  | { ok: false; reason: 'invalid_type' | 'too_large' };

/**
 * Client-side checks for PDF attachment in the Pro chat panel (no network).
 */
export function validateChatPanelPdf(file: File, maxUserMb: number): ChatPanelPdfValidation {
  if (file.type !== 'application/pdf') {
    return { ok: false, reason: 'invalid_type' };
  }
  if (file.size > mbToBytes(maxUserMb)) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}

export async function postGeneralChatMessage(
  body: SendRequestJsonBody,
): Promise<ChatMessagePostResponse> {
  return sendRequest<ChatMessagePostResponse>('/files/chat/general/message', 'POST', body);
}

export async function postGeneralChatStart(
  body: SendRequestJsonBody,
): Promise<ChatGeneralStartResponse> {
  return sendRequest<ChatGeneralStartResponse>('/files/chat/general/start', 'POST', body);
}

const PDF_CHAT_STREAM_PATH = '/api/proxy/chat/message/stream';

export async function streamPdfChatMessage(
  body: SendRequestJsonBody,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamSsePost(PDF_CHAT_STREAM_PATH, body, onEvent, signal);
}
