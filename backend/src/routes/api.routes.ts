import { Router } from 'express';
import { createAuthController, loginBodySchema } from '../controllers/auth.controller.js';
import { createDiagnosticsController } from '../controllers/diagnostics.controller.js';
import { createLoginRateLimiter } from '../middleware/loginRateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import type { AuthService } from '../services/auth.service.js';

export interface ApiDependencies {
  authService: AuthService;
  /** Temporary: registers GET /api/diagnostics/network. */
  enableDiagnostics: boolean;
  trustProxyHops: number;
}

/**
 * All /api routes. Public routes are registered first; everything after
 * `router.use(requireAuth(...))` requires a valid bearer token. Protected is
 * the default, so a newly added route can't be left open by accident.
 */
export function createApiRouter({
  authService,
  enableDiagnostics,
  trustProxyHops,
}: ApiDependencies): Router {
  const router = Router();
  const auth = createAuthController(authService);

  // --- Public ---
  // Rate limit runs first so malformed requests also count as failed attempts.
  router.post('/auth/login', createLoginRateLimiter(), validateBody(loginBodySchema), auth.login);

  // --- Protected: everything below requires a valid token ---
  // Also covers unknown /api paths: without a token they get 401, not 404,
  // so unauthenticated callers can't probe which routes exist.
  router.use(requireAuth(authService));

  router.get('/auth/me', auth.me);

  // TEMPORARY: hosting verification; see diagnostics.controller.ts.
  if (enableDiagnostics) {
    router.get('/diagnostics/network', createDiagnosticsController(trustProxyHops).network);
  }

  return router;
}
