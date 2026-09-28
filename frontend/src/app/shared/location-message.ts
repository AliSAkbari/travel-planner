import type { LocationResult } from '../core/api/api.models';

/**
 * Used only when the location request itself fails (e.g. network error).
 * Normally the backend chooses the default city; it must be the same one.
 */
export const FALLBACK_CITY_ID = 'calgary';

/**
 * The banner text for each outcome in docs/ARCHITECTURE.md §5.3. The UI always
 * says what was actually detected, so a surprising default is explained.
 *
 * @param location the /api/location result, or null if that request failed
 * @param cityName resolves a city id to its display name
 */
export function locationMessage(
  location: LocationResult | null,
  cityName: (cityId: string) => string,
): string {
  if (!location?.detected) {
    return `Couldn't detect your location — showing default: ${cityName(location?.cityId ?? FALLBACK_CITY_ID)}`;
  }

  const { city, region } = location.detected;
  const place = region ? `${city}, ${region}` : city;
  const chosen = cityName(location.cityId);

  if (location.match === 'nearest') {
    return `Detected: ${place} — showing nearest: ${chosen} (${location.distanceKm} km)`;
  }
  return `Detected: ${place} — no listed city nearby, showing default: ${chosen}`;
}
