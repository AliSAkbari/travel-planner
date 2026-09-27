import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness check for the hosting platform. Deliberately public and outside /api:
 * the platform's health checker can't send a token, and the response contains
 * no application data (no version, environment or uptime).
 * Not the conventional /healthz: Cloud Run reserves some paths ending in "z"
 * and answers them itself, so /healthz never reached the app in production.
 */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
