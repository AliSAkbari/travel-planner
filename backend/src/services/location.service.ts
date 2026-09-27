import type { GeoLocation, LookupIp } from '../clients/ip2location.client.js';
import { CITIES, DEFAULT_CITY_ID } from '../data/cities.js';
import { distanceKm } from '../utils/geo.js';
import { isPublicIp, normalizeIp } from '../utils/ipAddress.js';
import { TtlCache } from '../utils/ttlCache.js';

/** A detected location further than this from every listed city gets the default city. */
export const MAX_MATCH_DISTANCE_KM = 150;

export interface LocationResult {
  /** What the provider actually reported, shown to the user as-is. Null if detection failed. */
  detected: GeoLocation | null;
  /** The city to pre-select. */
  cityId: string;
  /** "nearest": a listed city within 150 km. "default": fell back to Calgary. */
  match: 'nearest' | 'default';
  /** Distance to the matched city, rounded to whole km; null for the default. */
  distanceKm: number | null;
}

export interface LocationServiceDeps {
  lookupIp: LookupIp;
  /**
   * In production a private req.ip means something is misconfigured, and locating
   * the server's own IP would return the datacenter; so skip straight to the default.
   * Outside production (a developer laptop), locating the machine's own public IP
   * gives the developer's real location.
   */
  isProduction: boolean;
}

// One entry per client IP, so the cache is size-capped: users control the keys.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

export function createLocationService({ lookupIp, isProduction }: LocationServiceDeps) {
  const cache = new TtlCache<LocationResult>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);

  /**
   * Detects where `rawIp` is and picks the city to pre-select.
   * Never throws: any failure (private IP, provider error, unknown address)
   * falls back to the default city, so detection can't break the page.
   */
  async function detect(rawIp: string | undefined): Promise<LocationResult> {
    const ip = rawIp ? normalizeIp(rawIp) : undefined;
    const isPublic = ip !== undefined && isPublicIp(ip);
    if (!isPublic && isProduction) return matchToCity(null);

    // Outside production, a private IP means "look up this machine": the provider
    // locates the caller when no ip is passed.
    const lookupTarget = isPublic ? ip : undefined;
    const cacheKey = lookupTarget ?? 'self';

    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let detected: GeoLocation | null;
    try {
      detected = await lookupIp(lookupTarget);
    } catch (err) {
      // Logged for operators, then degraded: the user still gets a working page.
      console.error('Location lookup failed; using the default city.', err);
      return matchToCity(null); // not cached, so the next request retries
    }

    const result = matchToCity(detected);
    cache.set(cacheKey, result);
    return result;
  }

  return { detect };
}

/** Picks the nearest listed city within range, otherwise the default. Exported for unit tests. */
export function matchToCity(detected: GeoLocation | null): LocationResult {
  if (!detected)
    return { detected: null, cityId: DEFAULT_CITY_ID, match: 'default', distanceKm: null };

  let nearest = { cityId: DEFAULT_CITY_ID, km: Infinity };
  for (const city of CITIES) {
    const km = distanceKm(detected, city);
    if (km < nearest.km) nearest = { cityId: city.id, km };
  }

  if (nearest.km <= MAX_MATCH_DISTANCE_KM) {
    return {
      detected,
      cityId: nearest.cityId,
      match: 'nearest',
      distanceKm: Math.round(nearest.km),
    };
  }
  return { detected, cityId: DEFAULT_CITY_ID, match: 'default', distanceKm: null };
}
