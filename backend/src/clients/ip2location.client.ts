import { z } from 'zod';
import { fetchJson } from './http.js';

// Every field is nullable: for private or unknown addresses ip2location still
// answers 200, just with nulls (verified against the live API).
const lookupSchema = z.object({
  city_name: z.string().nullable(),
  region_name: z.string().nullable(),
  country_code: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

/** Where an IP address is, according to the provider. */
export interface GeoLocation {
  city: string;
  /** Full region name, e.g. "Alberta" (the API has no short region code). */
  region: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

export type LookupIp = (ip?: string) => Promise<GeoLocation | null>;

/**
 * Creates the ip2location.io lookup.
 * Works without a key (1,000 lookups/day, counted per calling IP). With a key,
 * the quota is 50,000/month counted per key, which other tenants sharing
 * Google Cloud's outbound IPs can't use up (docs/ARCHITECTURE.md §5.3).
 */
export function createIp2LocationLookup(apiKey?: string): LookupIp {
  /**
   * Locates `ip`, or the caller's own public IP when `ip` is omitted.
   * Returns null when the provider can't place the address.
   */
  return async (ip) => {
    const params = new URLSearchParams();
    if (ip) params.set('ip', ip);
    if (apiKey) params.set('key', apiKey);

    const result = await fetchJson(
      'ip2location',
      `https://api.ip2location.io/?${params}`,
      lookupSchema,
    );
    if (result.city_name === null || result.latitude === null || result.longitude === null) {
      return null;
    }
    return {
      city: result.city_name,
      region: result.region_name,
      country: result.country_code,
      lat: result.latitude,
      lon: result.longitude,
    };
  };
}
