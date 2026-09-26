import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../utils/httpError.js';

/**
 * Creates the brute-force limiter for POST /api/auth/login.
 * A factory, called from createApp, so every app instance (and every test)
 * gets its own in-memory counters instead of sharing module-level state.
 */
export function createLoginRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    // Only failed attempts (status >= 400) count, so a legitimate user who
    // logs in often is never locked out; guessing passwords still is.
    skipSuccessfulRequests: true,
    // Send the standard RateLimit headers; omit the legacy X-RateLimit-* ones.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Hand off to errorHandler so 429s use the same JSON error shape as everything else.
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many failed login attempts. Try again later.'));
    },
  });
}
