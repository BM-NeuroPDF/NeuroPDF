import { translations } from '@/utils/translations';
import type { ErrorCategory, ErrorSeverity } from '@/utils/errors';
import { AppError, toAppError } from '@/utils/errors';

// ts-prune-ignore-next — public re-export for consumers (canonical types in @/utils/errors)
export type { ErrorCategory, ErrorSeverity } from '@/utils/errors';
export { AppError, toAppError };

type PresentedError = {
  category: ErrorCategory;
  severity: ErrorSeverity;
  inlineMessage: string;
  toastMessage?: string;
  shouldToast: boolean;
  statusCode?: number;
  errorId?: string;
};

type TranslationKey = keyof (typeof translations)['tr'];

function resolveLanguage(): 'tr' | 'en' {
  if (typeof window === 'undefined') return 'tr';
  const saved = window.localStorage.getItem('app-language');
  if (saved === 'tr' || saved === 'en') return saved;
  const browserLang = window.navigator.language.toLowerCase();
  return browserLang.startsWith('tr') ? 'tr' : 'en';
}

function t(key: TranslationKey): string {
  const lang = resolveLanguage();
  return translations[lang][key] ?? translations.tr[key] ?? key;
}

export function parseApiDetail(detail: unknown): string | null {
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === 'object' &&
        item !== null &&
        'msg' in item &&
        typeof (item as { msg: unknown }).msg === 'string'
          ? (item as { msg: string }).msg
          : null,
      )
      .filter(Boolean) as string[];
    return messages.length > 0 ? messages.join(', ') : null;
  }
  if (typeof detail === 'string') return detail;
  if (detail !== null && detail !== undefined) return JSON.stringify(detail);
  return null;
}

export function createApiError(params: {
  statusCode: number;
  detail?: unknown;
  fallbackMessage?: string;
}): AppError {
  const detailMessage = parseApiDetail(params.detail);
  const baseMessage =
    detailMessage ??
    params.fallbackMessage ??
    t('genericErrorWithCode').replace('{code}', String(params.statusCode));

  if (params.statusCode === 401 || params.statusCode === 403) {
    return new AppError({
      message: baseMessage,
      category: 'auth',
      severity: 'critical',
      code: 'api.auth',
      statusCode: params.statusCode,
      inlineMessage: baseMessage,
      toastMessage: t('errorAuthToast'),
    });
  }

  if (params.statusCode === 422) {
    return new AppError({
      message: baseMessage,
      category: 'validation',
      severity: 'minor',
      code: 'api.validation',
      statusCode: params.statusCode,
      inlineMessage: baseMessage,
    });
  }

  if (params.statusCode >= 500) {
    return new AppError({
      message: baseMessage,
      category: 'server',
      severity: 'critical',
      code: 'api.server',
      statusCode: params.statusCode,
      inlineMessage: baseMessage,
      toastMessage: t('errorServerToast'),
    });
  }

  return new AppError({
    message: baseMessage,
    category: 'unknown',
    severity: 'minor',
    code: 'api.unknown',
    statusCode: params.statusCode,
    inlineMessage: baseMessage,
  });
}

export function normalizeUnknownError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof TypeError) {
    const lowered = error.message.toLowerCase();
    if (
      lowered.includes('fetch failed') ||
      lowered.includes('econnreset') ||
      lowered.includes('socket hang up') ||
      lowered.includes('networkerror')
    ) {
      return new AppError({
        message: t('tempDbError'),
        category: 'network',
        severity: 'critical',
        code: 'network.type_error',
        inlineMessage: t('tempDbError'),
        toastMessage: t('errorNetworkToast'),
      });
    }
  }

  if (error instanceof Error) {
    return new AppError({
      message: error.message || t('errorUnknownInline'),
      category: 'unknown',
      severity: 'minor',
      code: 'unknown.error',
      inlineMessage: error.message || t('errorUnknownInline'),
    });
  }

  return new AppError({
    message: t('errorUnknownInline'),
    category: 'unknown',
    severity: 'minor',
    code: 'unknown.non_error',
    inlineMessage: t('errorUnknownInline'),
  });
}

export function presentError(error: unknown): PresentedError {
  const normalized = normalizeUnknownError(error);
  const inlineMessage = normalized.userMessageKey
    ? t(normalized.userMessageKey as TranslationKey)
    : normalized.inlineMessage;
  return {
    category: normalized.category,
    severity: normalized.severity,
    inlineMessage,
    toastMessage: normalized.toastMessage,
    shouldToast: normalized.severity === 'critical',
    statusCode: normalized.statusCode,
    errorId: normalized.errorId,
  };
}
