import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Validates req.body against a zod schema and replaces it with the parsed
 * (typed, trimmed, stripped of unknown keys) result.
 * On failure, schema.parse throws a ZodError, which errorHandler turns into
 * 400 VALIDATION_ERROR with the list of issues.
 */
export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}
