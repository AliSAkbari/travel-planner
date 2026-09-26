/**
 * An error that maps directly to an HTTP response.
 * Services throw it (e.g. `new HttpError(404, 'CITY_NOT_FOUND', 'Unknown city')`)
 * so they never touch Express's `res`; errorHandler turns it into JSON.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    /** Stable, machine-readable code the frontend can branch on. */
    readonly code: string,
    message: string,
    /** Optional extra context, e.g. a list of validation issues. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
