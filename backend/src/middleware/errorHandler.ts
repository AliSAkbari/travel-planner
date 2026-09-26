import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';

/** The single JSON error shape every endpoint returns. */
export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/**
 * Maps any thrown value to a status code and error body.
 * Kept separate from the middleware as a pure function so each case is easy to unit test.
 */
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof HttpError) {
    const error: ErrorBody['error'] = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    return { status: err.status, body: { error } };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          // path elements can be symbols, which Array.join() would throw on, hence map(String).
          details: err.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  // express.json() (body-parser) tags its errors with a `type` string.
  const bodyParserType = getBodyParserType(err);
  if (bodyParserType === 'entity.parse.failed') {
    return {
      status: 400,
      body: { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } },
    };
  }
  if (bodyParserType === 'entity.too.large') {
    return {
      status: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } },
    };
  }

  // Anything else is a bug or an unexpected failure: never leak its message or stack to the client.
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
  };
}

function getBodyParserType(err: unknown): string | undefined {
  if (err instanceof Error && 'type' in err && typeof err.type === 'string') return err.type;
  return undefined;
}

/**
 * Central error-handling middleware. Express recognises it as an error handler
 * because it declares four parameters, so `next` must stay in the signature.
 * In Express 5, errors thrown in async handlers also end up here automatically.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  // If the response has already started, we can't send a JSON body; Express's
  // default handler will close the connection instead.
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, body } = toErrorResponse(err);
  // Log only server-side failures; 4xx responses are the client's mistake, not ours.
  if (status >= 500) console.error(err);
  // HTTP requires a 401 to name the auth scheme the client should use (RFC 7235).
  if (status === 401) res.set('WWW-Authenticate', 'Bearer');
  res.status(status).json(body);
};

/**
 * Fallback for /api paths no router handled. Ensures unknown API URLs get a JSON 404
 * rather than falling through to the Angular app's index.html once that is served.
 */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
};
