import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
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
    // Counters are keyed by client IP. ipKeyGenerator groups IPv6 addresses by
    // /56 subnet, since one user typically controls a whole IPv6 range.
    // If req.ip is undefined (seen in the Firebase emulator, which connects over
    // a pipe and sends no X-Forwarded-For), all such requests share one bucket:
    // still limited, rather than crashing login with a 500.
    keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown-ip'),
    // Send the standard RateLimit headers; omit the legacy X-RateLimit-* ones.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Hand off to errorHandler so 429s use the same JSON error shape as everything else.
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many failed login attempts. Try again later.'));
    },
  });
}
