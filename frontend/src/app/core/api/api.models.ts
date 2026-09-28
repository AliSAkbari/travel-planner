// Response shapes of the backend API (see docs/ARCHITECTURE.md §4). Kept in
// one file so a backend change has one obvious place to be mirrored.

export interface LoginResponse {
  token: string;
  /** Token lifetime in seconds. */
  expiresIn: number;
  user: { username: string };
}

export interface CityOption {
  id: string;
  name: string;
  country: string;
}

export interface CitySummary {
  cityId: string;
  title: string;
  description: string | null;
  /** Plain text, never HTML: safe to interpolate. */
  extract: string;
  thumbnailUrl: string | null;
  wikiUrl: string;
}

export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown';

export interface CurrentWeather {
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
  /** "YYYY-MM-DD" in the city's own timezone. */
  date: string;
  minC: number;
  maxC: number;
  precipitationChancePercent: number | null;
  condition: WeatherCondition;
  label: string;
}

export interface CityWeather {
  cityId: string;
  timezone: string;
  current: CurrentWeather;
  /** Today + the next 6 days; index 0 is "today" in the city. */
  daily: DailyForecast[];
}

export interface DetectedLocation {
  city: string;
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

export interface LocationResult {
  /** What the provider reported; null when detection failed. */
  detected: DetectedLocation | null;
  cityId: string;
  match: 'nearest' | 'default';
  distanceKm: number | null;
}

/** The backend's single error shape. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}
