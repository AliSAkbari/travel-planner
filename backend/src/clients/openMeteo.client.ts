import { z } from 'zod';
import { fetchJson } from './http.js';

// Only the fields we request. Open-Meteo returns the daily values as parallel
// arrays (one array per variable, one element per day).
const forecastSchema = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    wind_speed_10m: z.number(),
    weather_code: z.number().int(),
    is_day: z.number().int(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number().int()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    // Allowed to be null: a probability isn't always available for every day.
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
});

export type OpenMeteoForecast = z.infer<typeof forecastSchema>;

/**
 * Current conditions plus 7 daily forecasts (today + 6 days) for a location.
 * `timezone=auto` makes Open-Meteo return dates in the city's own timezone,
 * so "today" is the city's today, not the server's.
 */
export function fetchForecast(lat: number, lon: number): Promise<OpenMeteoForecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7',
  });
  return fetchJson(
    'open-meteo',
    `https://api.open-meteo.com/v1/forecast?${params}`,
    forecastSchema,
  );
}
