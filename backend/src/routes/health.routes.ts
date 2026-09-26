import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness check for the hosting platform. Deliberately public and outside /api:
 * the platform's health checker can't send a token, and the response contains
 * no application data (no version, environment or uptime).
 */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});
