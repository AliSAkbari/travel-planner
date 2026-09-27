/**
 * A small set of conditions the frontend maps to icons. Keeping icons out of
 * the backend means the UI can change its icon set without an API change.
 */
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

export interface WeatherDescription {
  condition: WeatherCondition;
  label: string;
}

// WMO weather interpretation codes, as listed in Open-Meteo's documentation.
const WMO_CODES: Record<number, WeatherDescription> = {
  0: { condition: 'clear', label: 'Clear sky' },
  1: { condition: 'partly-cloudy', label: 'Mainly clear' },
  2: { condition: 'partly-cloudy', label: 'Partly cloudy' },
  3: { condition: 'cloudy', label: 'Overcast' },
  45: { condition: 'fog', label: 'Fog' },
  48: { condition: 'fog', label: 'Depositing rime fog' },
  51: { condition: 'drizzle', label: 'Light drizzle' },
  53: { condition: 'drizzle', label: 'Moderate drizzle' },
  55: { condition: 'drizzle', label: 'Dense drizzle' },
  56: { condition: 'drizzle', label: 'Light freezing drizzle' },
  57: { condition: 'drizzle', label: 'Dense freezing drizzle' },
  61: { condition: 'rain', label: 'Slight rain' },
  63: { condition: 'rain', label: 'Moderate rain' },
  65: { condition: 'rain', label: 'Heavy rain' },
  66: { condition: 'rain', label: 'Light freezing rain' },
  67: { condition: 'rain', label: 'Heavy freezing rain' },
  71: { condition: 'snow', label: 'Slight snowfall' },
  73: { condition: 'snow', label: 'Moderate snowfall' },
  75: { condition: 'snow', label: 'Heavy snowfall' },
  77: { condition: 'snow', label: 'Snow grains' },
  80: { condition: 'rain', label: 'Slight rain showers' },
  81: { condition: 'rain', label: 'Moderate rain showers' },
  82: { condition: 'rain', label: 'Violent rain showers' },
  85: { condition: 'snow', label: 'Slight snow showers' },
  86: { condition: 'snow', label: 'Heavy snow showers' },
  95: { condition: 'thunderstorm', label: 'Thunderstorm' },
  96: { condition: 'thunderstorm', label: 'Thunderstorm with slight hail' },
  99: { condition: 'thunderstorm', label: 'Thunderstorm with heavy hail' },
};

/** Maps a WMO code to a condition and label; unknown codes degrade gracefully. */
export function describeWeather(code: number): WeatherDescription {
  return WMO_CODES[code] ?? { condition: 'unknown', label: 'Unknown conditions' };
}
