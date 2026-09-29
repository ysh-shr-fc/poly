export type ApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "unsupported_language"
  | "too_large"
  | "invalid_document"
  | "validation_failed"
  | "upstream_error"
  | "rate_limited"
  | "internal_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  unsupported_language: 400,
  too_large: 413,
  invalid_document: 422,
  validation_failed: 422,
  upstream_error: 502,
  rate_limited: 429,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

// The translation pipeline throws plain Errors; classify them by message so callers
// get a stable code instead of a blanket 500.
const PATTERNS: Array<[RegExp, ApiErrorCode]> = [
  [/^Translation failed validation/, "validation_failed"],
  [/^(This file is not valid JSON|Malformed XML|No translatable text)/, "invalid_document"],
  [/^No glossary for/, "unsupported_language"],
  [/^(Translation provider|.* timed out after \d+ seconds)/, "upstream_error"],
];

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : "Translation failed.";
  const code = PATTERNS.find(([pattern]) => pattern.test(message))?.[1] ?? "internal_error";
  return new ApiError(code, message);
}
