import type { RequestHandler } from 'express';
import type { createLocationService } from '../services/location.service.js';

type LocationService = ReturnType<typeof createLocationService>;

export function createLocationController(locationService: LocationService) {
  /**
   * GET /api/location -> 200 LocationResult. Always 200: detection failures
   * fall back to the default city inside the service.
   * req.ip is the client's address because 'trust proxy' is set to the
   * measured hop count (docs/ARCHITECTURE.md §5.3).
   */
  const detect: RequestHandler = async (req, res) => {
    res.json(await locationService.detect(req.ip));
  };

  return { detect };
}
