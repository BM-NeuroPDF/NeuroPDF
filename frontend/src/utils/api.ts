import { getSession, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';
import {
  AppError,
  createApiError,
  normalizeUnknownError,
  parseApiDetail,
} from '@/utils/errorPresenter';
import { readOptionalDetailFromErrorJson } from '@/schemas/sendRequestErrorBody';

const TEMP_DB_ERROR_MESSAGE =
  'Veritabanı bağlantısı geçici olarak sağlanamadı. Lütfen birkaç saniye sonra tekrar deneyin.';

/**
 * Browser API base (no trailing slash). Empty string = same-origin so Next.js
 * rewrites (`/auth`, `/files`, …) proxy to the backend (avoids CORS on https://localhost:3000).
 */
export const resolveApiBaseUrl = (): string => {
  const envBase = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();
  const isHttpsBrowser = typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (isHttpsBrowser) {
    if (!envBase || envBase.startsWith('http://')) {
      return '';
    }
    return envBase.replace(/\/$/, '');
  }

  return (envBase || 'http://localhost:8000').replace(/\/$/, '');
};

const resolveBaseUrl = (): string => resolveApiBaseUrl();

/**
 * Token expire durumunda kullanıcıyı login sayfasına yönlendir
 */
const handleTokenExpired = async () => {
  // Sadece browser ortamında çalış
  if (typeof window === 'undefined') return;

  try {
    // NextAuth session'ını temizle ve login sayfasına yönlendir
    await signOut({
      callbackUrl: '/login',
      redirect: true,
    });
  } catch (error) {
    console.error('Sign out hatası:', error);
    // Fallback: Manuel yönlendirme
    window.location.href = '/login';
  }
};

let accessTokenOverride: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem('access_token_override') : null;
let refreshPromise: Promise<string | null> | null = null;

const saveAccessTokenOverride = (token: string | null) => {
  accessTokenOverride = token;
  if (typeof window === 'undefined') return;
  if (!token) {
    window.localStorage.removeItem('access_token_override');
    return;
  }
  window.localStorage.setItem('access_token_override', token);
};

const tryRefreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const baseUrl = resolveBaseUrl();
    const response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) return null;
    const data: unknown = await response.json().catch(() => null);
    const nextAccess = readAccessTokenFromRefreshJson(data);
    saveAccessTokenOverride(nextAccess);
    return nextAccess;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

/** JSON body for non-multipart requests */
export type SendRequestJsonBody = Record<string, unknown>;

/** Request body variants; use `instanceof` / `typeof` — no type assertions. */
type SendRequestBody = FormData | SendRequestJsonBody | string;

type SendRequestOptions = {
  /**
   * When true, 401 responses throw with the API error message without signing out.
   * Use for step-up flows (e.g. wrong password on account deletion) where 401 is not
   * an expired session.
   */
  skipAuthRedirectOn401?: boolean;
  _retryAfterRefresh?: boolean;
};

function readSessionBearerToken(session: Session | null): string | null {
  if (accessTokenOverride) return accessTokenOverride;
  if (!session) return null;
  return (
    session.accessToken ??
    session.apiToken ??
    session.user?.accessToken ??
    session.user?.apiToken ??
    null
  );
}

function readAccessTokenFromRefreshJson(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null;
  const token = Reflect.get(data, 'access_token');
  return typeof token === 'string' ? token : null;
}

function isSseEventShape(x: unknown): x is SseEvent {
  if (x === null || typeof x !== 'object') return false;
  const t = Reflect.get(x, 'type');
  return typeof t === 'string';
}

export const sendRequest = async <T = unknown>(
  endpoint: string,
  method: string = 'GET',
  body: SendRequestBody | null = null,
  isFileUpload: boolean = false,
  options?: SendRequestOptions,
): Promise<T> => {
  const hasRetriedRefresh = options?._retryAfterRefresh;
  const baseUrl = resolveBaseUrl();
  // Chat akışlarında rewrite kaynaklı ECONNRESET'i azaltmak için
  // dahili App Router proxy rotalarını kullan.
  const normalizedEndpoint = (() => {
    if (endpoint === '/files/chat/message') return '/api/proxy/chat/message';
    if (endpoint === '/files/chat/start') return '/api/proxy/chat/start';
    if (endpoint === '/files/chat/general/start') return '/api/proxy/chat/general/start';
    if (endpoint === '/files/chat/general/message') return '/api/proxy/chat/general/message';
    if (endpoint === '/files/chat/translate-message') return '/api/proxy/chat/translate-message';
    if (endpoint === '/files/chat/sessions') return '/api/proxy/chat/sessions';
    if (endpoint.startsWith('/files/chat/sessions/')) {
      return endpoint.replace('/files/chat/sessions', '/api/proxy/chat/sessions');
    }
    return endpoint;
  })();

  // 1. KRİTİK ADIM: Token'ı Session'dan (Cookie'den) Çek
  // getSession() fonksiyonu NextAuth cookie'sini çözer ve veriyi getirir.
  const session = await getSession();
  const token = readSessionBearerToken(session);

  // Misafir ID (Hala LocalStorage'da durur, bu doğru)
  const guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null;

  // 2. Headerları Hazırla
  const headers: Record<string, string> = {};

  // ✅ Token varsa ekle (Backend artık 'Misafir' demeyecek)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Misafir ID varsa ekle
  if (guestId) {
    headers['X-Guest-ID'] = guestId;
  }

  const hasNonFormBody =
    body !== null && body !== undefined && !(body instanceof FormData) && !isFileUpload;
  if (hasNonFormBody) {
    headers['Content-Type'] = 'application/json';
  }

  // 3. İsteği Gönder
  const config: RequestInit = {
    method: method,
    headers: headers,
    credentials: 'include',
  };

  if (body !== null && body !== undefined) {
    if (body instanceof FormData) {
      config.body = body;
    } else if (typeof body === 'string') {
      config.body = body;
    } else {
      config.body = JSON.stringify(body);
    }
  }

  try {
    // Proxy rotası kullanılıyorsa baseUrl'i zorla boşalt (relative fetch)
    const effectiveBaseUrl = normalizedEndpoint.startsWith('/api/proxy') ? '' : baseUrl;
    const response = await fetch(`${effectiveBaseUrl}${normalizedEndpoint}`, config);

    if (!response.ok) {
      // ✅ Token expire kontrolü (401 Unauthorized)
      if (response.status === 401) {
        const wwwAuthenticate = response.headers?.get?.('www-authenticate') ?? '';
        if (
          !options?.skipAuthRedirectOn401 &&
          !hasRetriedRefresh &&
          wwwAuthenticate.toLowerCase().includes('error="invalid_token"')
        ) {
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            return sendRequest<T>(endpoint, method, body, isFileUpload, {
              ...(options ?? {}),
              _retryAfterRefresh: true,
            });
          }
        }
        if (options?.skipAuthRedirectOn401) {
          const errorData401: unknown = await response.json().catch(() => ({}));
          throw createApiError({
            statusCode: 401,
            detail: readOptionalDetailFromErrorJson(errorData401),
          });
        }
        // Token expire olduğunda kullanıcıyı login sayfasına yönlendir
        await handleTokenExpired();
        saveAccessTokenOverride(null);
        // Yönlendirme yapıldıktan sonra hata fırlatma (kullanıcı zaten yönlendirildi)
        throw new AppError({
          message: 'Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.',
          category: 'auth',
          severity: 'critical',
          statusCode: 401,
          inlineMessage: 'Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.',
          toastMessage: 'Oturum doğrulaması başarısız.',
        });
      }

      if (response.status === 503 || response.status === 504) {
        throw new AppError({
          message: TEMP_DB_ERROR_MESSAGE,
          category: 'server',
          severity: 'critical',
          statusCode: response.status,
          inlineMessage: TEMP_DB_ERROR_MESSAGE,
          toastMessage: 'Sunucu tarafında bir sorun oluştu.',
        });
      }

      const errorData: unknown = await response.json().catch(() => ({}));
      const detail = readOptionalDetailFromErrorJson(errorData);
      const parsed = parseApiDetail(detail);
      throw createApiError({
        statusCode: response.status,
        detail,
        fallbackMessage: parsed ?? `Hata: ${response.status}`,
      });
    }

    // Yanıt tipine göre dön (JSON veya Dosya/Blob)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    // Binary responses: caller supplies T (commonly Blob); no JSON schema here.
    // @ts-expect-error TS cannot relate Blob to arbitrary generic T without assertion.
    return await response.blob();
  } catch (error) {
    // 401 hatası zaten handleTokenExpired ile yönetildi, tekrar loglamaya gerek yok
    if (error instanceof Error && error.message.includes('Oturum süreniz dolmuş')) {
      throw error; // Yönlendirme yapıldı, hata mesajını fırlat ama loglama
    }

    if (error instanceof TypeError) {
      const lowered = (error.message || '').toLowerCase();
      if (
        lowered.includes('fetch failed') ||
        lowered.includes('econnreset') ||
        lowered.includes('socket hang up') ||
        lowered.includes('networkerror')
      ) {
        throw new AppError({
          message: TEMP_DB_ERROR_MESSAGE,
          category: 'network',
          severity: 'critical',
          inlineMessage: TEMP_DB_ERROR_MESSAGE,
          toastMessage: 'Ağ bağlantısı sorunu oluştu.',
        });
      }
    }

    if (error instanceof Error) {
      const lowered = error.message.toLowerCase();
      if (
        lowered.includes('econnreset') ||
        lowered.includes('socket hang up') ||
        lowered.includes('fetch failed')
      ) {
        throw new AppError({
          message: TEMP_DB_ERROR_MESSAGE,
          category: 'network',
          severity: 'critical',
          inlineMessage: TEMP_DB_ERROR_MESSAGE,
          toastMessage: 'Ağ bağlantısı sorunu oluştu.',
        });
      }
    }

    console.error('API İsteği Hatası:', error);
    throw normalizeUnknownError(error);
  }
};

export async function swrFetcher<T = unknown>(endpoint: string): Promise<T> {
  return sendRequest<T>(endpoint, 'GET');
}

/** Kayıtlı PDF sohbet oturumu (backend `pdf_chat_sessions` satırı) */
export type ChatSessionListItem = {
  id: string;
  session_id: string;
  pdf_name: string;
  title?: string;
  pdf_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function fetchChatSessions(): Promise<{
  sessions: ChatSessionListItem[];
}> {
  return sendRequest<{ sessions: ChatSessionListItem[] }>('/files/chat/sessions', 'GET');
}

export async function fetchSessionMessages(sessionDbId: string): Promise<{
  messages: Array<{
    role: string;
    content: string;
    id?: string | null;
    sourceLanguage?: 'tr' | 'en' | null;
    translations?: Record<string, string> | null;
    created_at?: string | null;
  }>;
}> {
  return sendRequest<{
    messages: Array<{
      role: string;
      content: string;
      id?: string | null;
      sourceLanguage?: 'tr' | 'en' | null;
      translations?: Record<string, string> | null;
      created_at?: string | null;
    }>;
  }>(`/files/chat/sessions/${sessionDbId}/messages`, 'GET');
}

export async function resumeChatSession(sessionDbId: string): Promise<{
  session_id: string;
  pdf_id: string | null;
  db_session_id: string;
  filename?: string;
  messages?: Array<{
    role: string;
    content: string;
    id?: string | null;
    sourceLanguage?: 'tr' | 'en' | null;
    translations?: Record<string, string> | null;
    created_at?: string | null;
  }>;
}> {
  return sendRequest<{
    session_id: string;
    pdf_id: string | null;
    db_session_id: string;
    filename?: string;
    messages?: Array<{
      role: string;
      content: string;
      id?: string | null;
      sourceLanguage?: 'tr' | 'en' | null;
      translations?: Record<string, string> | null;
      created_at?: string | null;
    }>;
  }>(`/files/chat/sessions/${sessionDbId}/resume`, 'POST');
}

export async function fetchStoredPdfBlob(pdfId: string): Promise<Blob> {
  return sendRequest<Blob>(`/files/stored/${pdfId}`, 'GET');
}

export type SseEvent = { type: string; [k: string]: unknown };

export async function streamSsePost(
  endpoint: string,
  body: SendRequestJsonBody,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const session = await getSession();
  const token = readSessionBearerToken(session);
  const guestId = typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (guestId) headers['X-Guest-ID'] = guestId;

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  if (!response.ok || !response.body) {
    const txt = await response.text().catch(() => '');
    throw new Error(txt || `Hata: ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (isSseEventShape(parsed)) onEvent(parsed);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

export type UserDocumentListItem = {
  id: string;
  filename: string | null;
  file_size: number | null;
  created_at: string | null;
  page_count: number | null;
};

export async function getUserDocuments(): Promise<{
  files: UserDocumentListItem[];
  total: number;
}> {
  return sendRequest<{ files: UserDocumentListItem[]; total: number }>('/files/my-files', 'GET');
}

/** POST /files/summarize, /files/summarize-guest */
export type SummarizeApiResponse = {
  summary?: string;
  pdf_text?: string;
};

export type ChatStartFromTextResponse = {
  session_id?: string;
  db_session_id?: string | null;
};

export type ChatGeneralStartResponse = { session_id?: string };

export type ChatMessagePostResponse = {
  answer?: string;
  client_actions?: unknown;
};

export type TranslateMessageResponse = { translation?: string };

export type GlobalStatsResponse = {
  total_users?: number;
  total_processed?: number;
  total_ai_summaries?: number;
};

export type AuthMeResponse = {
  user_id?: string;
  email?: string | null;
  username?: string | null;
  provider?: string;
  eula_accepted?: boolean | null;
  created_at?: string | null;
};
