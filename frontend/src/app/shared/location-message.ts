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

export interface LocationBanner {
  message: string;
  /** Offered once the user has picked another city: reselects the detected (or default) one. */
  returnTo: { cityId: string; label: string } | null;
}

/**
 * What the banner shows, given what is selected now.
 * - The "home" city (detected match, or the default) is selected: the full
 *   explanation from locationMessage.
 * - Another city is selected: a short reminder of where the user is, plus a
 *   button back to the home city. The long "showing nearest: …" sentence would
 *   be wrong at that point, because it isn't what's being shown.
 */
export function locationBanner(
  location: LocationResult | null,
  selectedCityId: string | null,
  cityName: (cityId: string) => string,
): LocationBanner {
  const homeCityId = location?.cityId ?? FALLBACK_CITY_ID;
  if (selectedCityId === null || selectedCityId === homeCityId) {
    return { message: locationMessage(location, cityName), returnTo: null };
  }

  const detected = location?.detected;
  const message = detected
    ? `Your location: ${detected.region ? `${detected.city}, ${detected.region}` : detected.city}`
    : "Couldn't detect your location";
  return { message, returnTo: { cityId: homeCityId, label: `Back to ${cityName(homeCityId)}` } };
}
