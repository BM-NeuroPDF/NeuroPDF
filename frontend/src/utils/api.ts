import { getSession, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';

const TEMP_DB_ERROR_MESSAGE =
  'Veritabanı bağlantısı geçici olarak sağlanamadı. Lütfen birkaç saniye sonra tekrar deneyin.';

/**
 * Browser API base (no trailing slash). Empty string = same-origin so Next.js
 * rewrites (`/auth`, `/files`, …) proxy to the backend (avoids CORS on https://localhost:3000).
 */
export const resolveApiBaseUrl = (): string => {
  const envBase = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();
  const isHttpsBrowser =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

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

/** JSON body for non-multipart requests */
export type SendRequestJsonBody = Record<string, unknown>;

function readSessionBearerToken(session: Session | null): string | null {
  if (!session) return null;
  return (
    session.accessToken ??
    session.apiToken ??
    session.user?.accessToken ??
    session.user?.apiToken ??
    null
  );
}

function isFastApiValidationItem(v: unknown): v is { msg: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'msg' in v &&
    typeof (v as { msg: unknown }).msg === 'string'
  );
}

export const sendRequest = async (
  endpoint: string,
  method: string = 'GET',
  body: FormData | SendRequestJsonBody | null = null,
  isFileUpload: boolean = false
) => {
  const baseUrl = resolveBaseUrl();
  // Chat akışlarında rewrite kaynaklı ECONNRESET'i azaltmak için
  // dahili App Router proxy rotalarını kullan.
  const normalizedEndpoint = (() => {
    if (endpoint === '/files/chat/message') return '/api/proxy/chat/message';
    if (endpoint === '/files/chat/start') return '/api/proxy/chat/start';
    if (endpoint === '/files/chat/general/start')
      return '/api/proxy/chat/general/start';
    if (endpoint === '/files/chat/general/message')
      return '/api/proxy/chat/general/message';
    if (endpoint === '/files/chat/translate-message')
      return '/api/proxy/chat/translate-message';
    if (endpoint === '/files/chat/sessions') return '/api/proxy/chat/sessions';
    if (endpoint.startsWith('/files/chat/sessions/')) {
      return endpoint.replace(
        '/files/chat/sessions',
        '/api/proxy/chat/sessions'
      );
    }
    return endpoint;
  })();

  // 1. KRİTİK ADIM: Token'ı Session'dan (Cookie'den) Çek
  // getSession() fonksiyonu NextAuth cookie'sini çözer ve veriyi getirir.
  const session = await getSession();
  const token = readSessionBearerToken(session);

  // Misafir ID (Hala LocalStorage'da durur, bu doğru)
  const guestId =
    typeof window !== 'undefined' ? localStorage.getItem('guest_id') : null;

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

  // Dosya yüklemiyorsak JSON olduğunu belirt
  if (!isFileUpload && body) {
    headers['Content-Type'] = 'application/json';
  }

  // 3. İsteği Gönder
  const config: RequestInit = {
    method: method,
    headers: headers,
  };

  if (body) {
    config.body = isFileUpload
      ? (body as FormData)
      : JSON.stringify(body as SendRequestJsonBody);
  }

  try {
    // Proxy rotası kullanılıyorsa baseUrl'i zorla boşalt (relative fetch)
    const effectiveBaseUrl = normalizedEndpoint.startsWith('/api/proxy')
      ? ''
      : baseUrl;
    const response = await fetch(
      `${effectiveBaseUrl}${normalizedEndpoint}`,
      config
    );

    if (!response.ok) {
      // ✅ Token expire kontrolü (401 Unauthorized)
      if (response.status === 401) {
        // Token expire olduğunda kullanıcıyı login sayfasına yönlendir
        await handleTokenExpired();
        // Yönlendirme yapıldıktan sonra hata fırlatma (kullanıcı zaten yönlendirildi)
        throw new Error('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.');
      }

      if (response.status === 503 || response.status === 504) {
        throw new Error(TEMP_DB_ERROR_MESSAGE);
      }

      const errorData = (await response.json().catch(() => ({}))) as {
        detail?: unknown;
      };

      let errorMessage = `Hata: ${response.status}`;
      if (errorData.detail !== undefined && errorData.detail !== null) {
        if (Array.isArray(errorData.detail)) {
          // FastAPI Validator Error Array (422)
          errorMessage = errorData.detail
            .filter(isFastApiValidationItem)
            .map((err) => err.msg)
            .join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else {
          errorMessage = JSON.stringify(errorData.detail);
        }
      }

      throw new Error(errorMessage);
    }

    // Yanıt tipine göre dön (JSON veya Dosya/Blob)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.blob();
    }
  } catch (error) {
    // 401 hatası zaten handleTokenExpired ile yönetildi, tekrar loglamaya gerek yok
    if (
      error instanceof Error &&
      error.message.includes('Oturum süreniz dolmuş')
    ) {
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
        throw new Error(TEMP_DB_ERROR_MESSAGE);
      }
    }

    if (error instanceof Error) {
      const lowered = error.message.toLowerCase();
      if (
        lowered.includes('econnreset') ||
        lowered.includes('socket hang up') ||
        lowered.includes('fetch failed')
      ) {
        throw new Error(TEMP_DB_ERROR_MESSAGE);
      }
    }
    console.error('API İsteği Hatası:', error);
    throw error;
  }
};

export async function swrFetcher<T = unknown>(endpoint: string): Promise<T> {
  return sendRequest(endpoint, 'GET') as Promise<T>;
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
  return sendRequest('/files/chat/sessions', 'GET');
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
  return sendRequest(`/files/chat/sessions/${sessionDbId}/messages`, 'GET');
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
  return sendRequest(`/files/chat/sessions/${sessionDbId}/resume`, 'POST');
}

export async function fetchStoredPdfBlob(pdfId: string): Promise<Blob> {
  return sendRequest(`/files/stored/${pdfId}`, 'GET') as Promise<Blob>;
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
  return sendRequest('/files/my-files', 'GET');
}
