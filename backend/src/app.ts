import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Config } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.routes.js';

/**
 * Builds the Express app without starting a server, so integration tests can
 * drive it with supertest and server.ts stays a thin entry point.
 * Middleware order matters: each request flows through these top to bottom.
 */
export function createApp(config: Config): Express {
  const app = express();

  // Trust exactly N reverse-proxy hops, so req.ip is the client address the
  // outermost trusted proxy saw, not a value the client wrote into
  // X-Forwarded-For. See docs/ARCHITECTURE.md §5.3.
  app.set('trust proxy', config.trustProxyHops);

  // Security headers (CSP, nosniff, frame protection, etc.); also removes X-Powered-By.
  app.use(helmet());
  // Small limit: the API only ever receives tiny JSON bodies (the login form).
  app.use(express.json({ limit: '10kb' }));

  app.use(healthRouter);

  // Any /api path not matched above gets a JSON 404.
  app.use('/api', notFound);
  // Must be registered last so it receives errors from everything above.
  app.use(errorHandler);

  return app;
}
