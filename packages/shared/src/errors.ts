export const ErrorCode = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_RATE_LIMITED: 'UPSTREAM_RATE_LIMITED',
  UPSTREAM_AUTH: 'UPSTREAM_AUTH',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  INTERNAL: 'INTERNAL'
} as const;
export type ErrorCodeKey = keyof typeof ErrorCode;

export interface SearchErrorMeta {
  retryAfterSec?: number;
  provider?: string;
  cause?: unknown;
}

export class SearchError extends Error {
  readonly code: ErrorCodeKey;
  readonly retryAfterSec?: number;
  readonly provider?: string;

  constructor(code: ErrorCodeKey, message: string, meta: SearchErrorMeta = {}) {
    super(message);
    this.name = 'SearchError';
    this.code = code;
    if (meta.retryAfterSec !== undefined) this.retryAfterSec = meta.retryAfterSec;
    if (meta.provider !== undefined) this.provider = meta.provider;
    if (meta.cause !== undefined) (this as { cause?: unknown }).cause = meta.cause;
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { code: this.code, message: this.message };
    if (this.retryAfterSec !== undefined) out.retryAfterSec = this.retryAfterSec;
    if (this.provider !== undefined) out.provider = this.provider;
    return out;
  }
}
