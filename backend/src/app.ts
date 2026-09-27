import express, { type Express } from 'express';
import helmet from 'helmet';
import { createIp2LocationLookup } from './clients/ip2location.client.js';
import { fetchForecast } from './clients/openMeteo.client.js';
import { fetchSummary } from './clients/wikipedia.client.js';
import type { Config } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { createApiRouter } from './routes/api.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createAuthService } from './services/auth.service.js';
import { createCityService } from './services/city.service.js';
import { createLocationService } from './services/location.service.js';
import { createWeatherService } from './services/weather.service.js';

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

  // API responses are per-user (and the login response contains a token), so
  // neither the browser nor the Hosting CDN may store them.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Composition root: services are created per app instance (so tests never
  // share caches or counters) and receive their API clients as plain functions,
  // which unit tests replace with fakes.
  app.use(
    '/api',
    createApiRouter({
      authService: createAuthService(config),
      cityService: createCityService({ fetchSummary }),
      weatherService: createWeatherService({ fetchForecast }),
      locationService: createLocationService({
        lookupIp: createIp2LocationLookup(config.ip2locationApiKey),
        isProduction: config.nodeEnv === 'production',
      }),
    }),
  );

  // Any /api path not matched above (and past requireAuth) gets a JSON 404.
  app.use('/api', notFound);
  // Must be registered last so it receives errors from everything above.
  app.use(errorHandler);

  return app;
}
