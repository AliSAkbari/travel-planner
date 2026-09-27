import type { ZodType } from 'zod';

/** Any external API call gives up after this long, so one slow provider can't hang a request. */
const TIMEOUT_MS = 5000;

/**
 * An external API failed: network error, timeout, non-2xx status, or a response
 * that doesn't match the expected shape. errorHandler turns it into 502.
 */
export class UpstreamError extends Error {
  constructor(
    /** Which provider failed, for the server log (e.g. "open-meteo"). */
    readonly provider: string,
    message: string,
    /** The provider's HTTP status, if it answered at all. */
    readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'UpstreamError';
  }
}

/**
 * GETs a URL and returns its JSON body, validated against `schema`.
 * Validating means the rest of the code can trust the types instead of
 * assuming the provider never changes its response format.
 */
export async function fetchJson<T>(
  provider: string,
  url: string,
  schema: ZodType<T>,
  headers: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // Timeouts surface as a TimeoutError; DNS/connection failures as a TypeError.
    throw new UpstreamError(provider, err instanceof Error ? err.message : String(err));
  }

  if (!response.ok) {
    throw new UpstreamError(provider, `HTTP ${response.status}`, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new UpstreamError(provider, 'response is not valid JSON', response.status);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new UpstreamError(provider, 'unexpected response shape', response.status);
  }
  return parsed.data;
}
