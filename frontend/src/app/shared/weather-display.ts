import type { WeatherCondition } from '../core/api/api.models';

/**
 * Icon for each weather condition. The backend sends a condition, not an
 * icon, so the icon set is purely a frontend choice. Names are Material
 * Symbols SVGs registered in icons.ts.
 */
const CONDITION_ICONS: Record<WeatherCondition, string> = {
  clear: 'sunny',
  'partly-cloudy': 'partly_cloudy_day',
  cloudy: 'cloud',
  fog: 'foggy',
  drizzle: 'rainy_light',
  rain: 'rainy',
  snow: 'weather_snowy',
  thunderstorm: 'thunderstorm',
  unknown: 'help',
};

export function weatherIcon(condition: WeatherCondition): string {
  return CONDITION_ICONS[condition];
}

/** "14 °C": rounded to whole degrees, always with the unit. */
export function formatCelsius(value: number): string {
  // Math.round(-0.4) is -0, which would print as "-0 °C".
  const rounded = Math.round(value) || 0;
  return `${rounded} °C`;
}

/**
 * The label for a forecast day: "Today" for the first entry, otherwise the
 * short weekday ("Mon"). The date is the city's local calendar date, so it is
 * interpreted as UTC: the browser's own timezone must not shift the weekday.
 */
export function dayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Today';
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/** The full date for screen readers and tooltips, e.g. "Monday, September 28". */
export function fullDate(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
