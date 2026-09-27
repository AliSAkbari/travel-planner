import { Router } from 'express';
import { createAuthController, loginBodySchema } from '../controllers/auth.controller.js';
import { createCitiesController } from '../controllers/cities.controller.js';
import { createLocationController } from '../controllers/location.controller.js';
import { createLoginRateLimiter } from '../middleware/loginRateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import type { AuthService } from '../services/auth.service.js';
import type { createCityService } from '../services/city.service.js';
import type { createLocationService } from '../services/location.service.js';
import type { createWeatherService } from '../services/weather.service.js';

export interface ApiDependencies {
  authService: AuthService;
  cityService: ReturnType<typeof createCityService>;
  weatherService: ReturnType<typeof createWeatherService>;
  locationService: ReturnType<typeof createLocationService>;
}

/**
 * All /api routes. Public routes are registered first; everything after
 * `router.use(requireAuth(...))` requires a valid bearer token. Protected is
 * the default, so a newly added route can't be left open by accident.
 */
export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();
  const auth = createAuthController(deps.authService);
  const cities = createCitiesController(deps.cityService, deps.weatherService);
  const location = createLocationController(deps.locationService);

  // --- Public ---
  // Rate limit runs first so malformed requests also count as failed attempts.
  router.post('/auth/login', createLoginRateLimiter(), validateBody(loginBodySchema), auth.login);

  // --- Protected: everything below requires a valid token ---
  // Also covers unknown /api paths: without a token they get 401, not 404,
  // so unauthenticated callers can't probe which routes exist.
  router.use(requireAuth(deps.authService));

  router.get('/auth/me', auth.me);
  router.get('/location', location.detect);
  router.get('/cities', cities.list);
  router.get('/cities/:id/summary', cities.summary);
  router.get('/cities/:id/weather', cities.weather);

  return router;
}
