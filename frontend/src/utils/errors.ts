export type ErrorCategory = 'network' | 'validation' | 'auth' | 'server' | 'unknown';

export type ErrorSeverity = 'critical' | 'minor';

export class AppError extends Error {
  category: ErrorCategory;
  severity: ErrorSeverity;
  /** Stable code for logs / analytics (e.g. `chat.bootstrap.failed`). */
  code: string;
  /** Optional i18n key; errorPresenter resolves via translations when set. */
  userMessageKey?: string;
  /** Original rejection / cause preserved for debugging. */
  cause?: unknown;
  statusCode?: number;
  errorId?: string;
  inlineMessage: string;
  toastMessage?: string;

  constructor(params: {
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    code?: string;
    userMessageKey?: string;
    cause?: unknown;
    statusCode?: number;
    errorId?: string;
    inlineMessage?: string;
    toastMessage?: string;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.category = params.category;
    this.severity = params.severity;
    this.code = params.code ?? 'generic';
    this.userMessageKey = params.userMessageKey;
    this.cause = params.cause;
    this.statusCode = params.statusCode;
    this.errorId = params.errorId;
    this.inlineMessage = params.inlineMessage ?? params.message;
    this.toastMessage = params.toastMessage;
  }
}

export function isAppError(x: unknown): x is AppError {
  return x instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    const trimmed = error.message?.trim() ?? '';
    if (trimmed) {
      return new AppError({
        message: error.message,
        category: 'unknown',
        severity: 'minor',
        code: 'wrapped',
        cause: error,
        inlineMessage: trimmed,
      });
    }
    return new AppError({
      message: error.message,
      category: 'unknown',
      severity: 'minor',
      code: 'wrapped.empty_message',
      userMessageKey: 'errorUnknownInline',
      cause: error,
      inlineMessage: '',
    });
  }
  const text = String(error);
  return new AppError({
    message: text,
    category: 'unknown',
    severity: 'minor',
    code: 'unknown',
    userMessageKey: 'errorUnknownInline',
    cause: error,
    inlineMessage: text,
  });
}
