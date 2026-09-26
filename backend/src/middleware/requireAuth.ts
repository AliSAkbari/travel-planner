import type { RequestHandler, Response } from 'express';
import type { AuthService, AuthUser } from '../services/auth.service.js';
import { HttpError } from '../utils/httpError.js';

// "Bearer <token>". The scheme name is case-insensitive per the HTTP spec (RFC 7235).
const BEARER_PATTERN = /^Bearer +(\S+)$/i;

/**
 * Rejects the request with 401 unless it carries a valid bearer token.
 * On success, stores the user in res.locals.user (Express's per-request storage).
 * Errors are thrown, not sent: errorHandler formats them and adds WWW-Authenticate.
 */
export function requireAuth(authService: AuthService): RequestHandler {
  return (req, res, next) => {
    const token = BEARER_PATTERN.exec(req.get('authorization') ?? '')?.[1];
    if (!token) {
      throw new HttpError(401, 'MISSING_TOKEN', 'Missing or malformed Authorization header');
    }

    res.locals.user = authService.verifyToken(token);
    next();
  };
}

/**
 * Returns the authenticated user for a route mounted behind requireAuth.
 * A missing user means a route was wired without requireAuth: a server bug, hence 500.
 */
export function getAuthUser(res: Response): AuthUser {
  const { user } = res.locals;
  if (!user) throw new Error('getAuthUser called on a route not protected by requireAuth');
  return user;
}
