import type { RequestHandler } from 'express';
import type { createCityService } from '../services/city.service.js';
import type { createWeatherService } from '../services/weather.service.js';

type CityService = ReturnType<typeof createCityService>;
type WeatherService = ReturnType<typeof createWeatherService>;

/**
 * HTTP layer for city data. Resolving :id through cityService.getCity means an
 * unknown id is a 404 before any external API is called.
 */
export function createCitiesController(cityService: CityService, weatherService: WeatherService) {
  /** GET /api/cities -> 200 [{ id, name, country }] */
  const list: RequestHandler = (_req, res) => {
    res.json(cityService.listCities());
  };

  /** GET /api/cities/:id/summary -> 200 CitySummary */
  const summary: RequestHandler<{ id: string }> = async (req, res) => {
    const city = cityService.getCity(req.params.id);
    res.json(await cityService.getSummary(city));
  };

  /** GET /api/cities/:id/weather -> 200 CityWeather (current + 7 days) */
  const weather: RequestHandler<{ id: string }> = async (req, res) => {
    const city = cityService.getCity(req.params.id);
    res.json(await weatherService.getWeather(city));
  };

  return { list, summary, weather };
}
