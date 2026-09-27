import { UpstreamError } from '../clients/http.js';
import type { OpenMeteoForecast } from '../clients/openMeteo.client.js';
import type { City } from '../data/cities.js';
import { TtlCache } from '../utils/ttlCache.js';
import { describeWeather, type WeatherCondition } from './weatherCodes.js';

export interface CurrentWeather {
  /** Local time of the observation in the city's timezone, e.g. "2026-09-27T17:00". */
  time: string;
  temperatureC: number;
  feelsLikeC: number;
  humidityPercent: number;
  windKmh: number;
  isDay: boolean;
  condition: WeatherCondition;
  label: string;
}

export interface DailyForecast {
  /** Calendar date in the city's timezone, e.g. "2026-09-27". */
  date: string;
  minC: number;
  maxC: number;
  /** Null when the provider has no probability for that day. */
  precipitationChancePercent: number | null;
  condition: WeatherCondition;
  label: string;
}

export interface CityWeather {
  cityId: string;
  timezone: string;
  current: CurrentWeather;
  /** Today + the next 6 days (the rolling "current week"). */
  daily: DailyForecast[];
}

export interface WeatherServiceDeps {
  fetchForecast: (lat: number, lon: number) => Promise<OpenMeteoForecast>;
}

// Open-Meteo refreshes current conditions every 15 minutes, so caching for 10
// never hides a newer reading for long.
const CACHE_TTL_MS = 10 * 60 * 1000;

export function createWeatherService({ fetchForecast }: WeatherServiceDeps) {
  // Keyed by city id: at most one entry per listed city.
  const cache = new TtlCache<CityWeather>(CACHE_TTL_MS);

  async function getWeather(city: City): Promise<CityWeather> {
    return cache.getOrLoad(city.id, async () =>
      toCityWeather(city.id, await fetchForecast(city.lat, city.lon)),
    );
  }

  return { getWeather };
}

/** Converts Open-Meteo's response into the API's shape. Exported for unit tests. */
export function toCityWeather(cityId: string, forecast: OpenMeteoForecast): CityWeather {
  const { current, daily } = forecast;

  // Open-Meteo returns one array per variable. Zip them into one object per day,
  // and refuse (rather than render gaps) if the arrays don't line up.
  const days = daily.time.map((date, i): DailyForecast => {
    const code = daily.weather_code[i];
    const maxC = daily.temperature_2m_max[i];
    const minC = daily.temperature_2m_min[i];
    const precipitation = daily.precipitation_probability_max[i];
    if (
      code === undefined ||
      maxC === undefined ||
      minC === undefined ||
      precipitation === undefined
    ) {
      throw new UpstreamError('open-meteo', 'daily arrays have different lengths');
    }
    return {
      date,
      minC,
      maxC,
      precipitationChancePercent: precipitation,
      ...describeWeather(code),
    };
  });

  return {
    cityId,
    timezone: forecast.timezone,
    current: {
      time: current.time,
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidityPercent: current.relative_humidity_2m,
      windKmh: current.wind_speed_10m,
      isDay: current.is_day === 1,
      ...describeWeather(current.weather_code),
    },
    daily: days,
  };
}
