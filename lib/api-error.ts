/**
 * Shared shape and parser for API errors returned by the FastAPI service.
 *
 * Backend always emits `{detail: ApiError}` on non-2xx responses (and may
 * embed an ApiError in job status payloads). This helper handles all the
 * fallback paths (legacy string detail, missing detail, network failure,
 * non-JSON body) so callers can rely on a normalized object.
 */

export type ApiError = {
  code?: string;
  message: string;
  hint?: string | null;
  technical?: string | null;
};

export async function parseApiError(res: Response): Promise<ApiError> {
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    // body was empty or not JSON
  }

  const detail = (body as { detail?: unknown } | undefined)?.detail;
  if (detail && typeof detail === 'object') {
    return normalize(detail as Partial<ApiError>);
  }
  if (typeof detail === 'string') {
    return { message: detail };
  }

  const message = (body as { message?: string } | undefined)?.message;
  if (typeof message === 'string' && message.length > 0) {
    return { message };
  }

  return {
    message: res.statusText || `Request failed (HTTP ${res.status})`,
  };
}

export function normalize(value: Partial<ApiError>): ApiError {
  return {
    code: value.code,
    message:
      typeof value.message === 'string' && value.message.length > 0
        ? value.message
        : 'Request failed.',
    hint: value.hint ?? null,
    technical: value.technical ?? null,
  };
}

export function errorFromException(e: unknown, fallback: string): ApiError {
  if (e instanceof Error) return { message: e.message || fallback };
  return { message: typeof e === 'string' ? e : fallback };
}
