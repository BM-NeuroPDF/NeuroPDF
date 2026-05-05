/**
 * Merkezi hata günlüğü: PII maskeleme, ortam bazlı ayrıntı, Sentry (varsa).
 */

const EMAIL_PATTERN =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

/** Üç bölümlü JWT benzeri taşıyıcılar (eyJ…). */
const JWT_LIKE_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

const PASSWORD_KEY =
  /^(password|passwd|pwd|currentpassword|newpassword|confirmpassword|oldpassword)$/i;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function scrubPii(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(JWT_LIKE_PATTERN, '[REDACTED_JWT]');
}

export function scrubPiiFromUnknown(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubPii(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubPii(value.message),
      stack: value.stack ? scrubPii(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map(scrubPiiFromUnknown);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PASSWORD_KEY.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubPiiFromUnknown(v);
      }
    }
    return out;
  }
  return value;
}

function toReportableError(error: unknown): Error {
  if (error instanceof Error) {
    const e = new Error(scrubPii(error.message));
    e.name = error.name;
    if (error.stack) {
      e.stack = scrubPii(error.stack);
    }
    return e;
  }
  return new Error(scrubPii(String(error)));
}

function reportToSentry(error: Error, extra?: Record<string, unknown>): void {
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(error, extra ? { extra } : undefined);
    })
    .catch(() => {
      /* Sentry yok veya yüklenemedi */
    });
}

type LogErrorContext = Record<string, unknown>;

/**
 * Hatayı güvenli biçimde konsola yazar ve mümkünse Sentry’e iletir.
 * Production’da yalnızca maskelemiş kısa mesaj; geliştirmede daha fazla ayrıntı.
 */
export function logError(error: unknown, context?: LogErrorContext): void {
  const scrubbedContext = context ? (scrubPiiFromUnknown(context) as LogErrorContext) : undefined;
  const reportable = toReportableError(error);
  const scope = (scrubbedContext?.scope as string | undefined) ?? 'error';

  if (isProduction()) {
    console.error(`[${scope}]`, reportable.message);
  } else {
    console.error(`[${scope}]`, scrubPiiFromUnknown(error), scrubbedContext ?? '');
  }

  reportToSentry(reportable, scrubbedContext);
}
