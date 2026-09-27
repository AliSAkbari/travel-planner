/** A city the user can pick. The list is fixed, so every data endpoint takes a known id. */
export interface City {
  /** URL-safe identifier used in /api/cities/:id/... */
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  lat: number;
  lon: number;
  /**
   * Exact Wikipedia article title. Explicit, so lookups never land on a
   * disambiguation page (e.g. "New_York_City", not "New_York").
   */
  wikiTitle: string;
}

/** Calgary is the fallback when the user's location can't be matched (see docs/ARCHITECTURE.md §5.3). */
export const DEFAULT_CITY_ID = 'calgary';

// Coordinates are the ones Wikipedia's summary API reports for each article.
export const CITIES: readonly City[] = [
  {
    id: 'calgary',
    name: 'Calgary',
    country: 'CA',
    lat: 51.0475,
    lon: -114.0625,
    wikiTitle: 'Calgary',
  },
  {
    id: 'edmonton',
    name: 'Edmonton',
    country: 'CA',
    lat: 53.5344,
    lon: -113.4903,
    wikiTitle: 'Edmonton',
  },
  {
    id: 'vancouver',
    name: 'Vancouver',
    country: 'CA',
    lat: 49.2608,
    lon: -123.1139,
    wikiTitle: 'Vancouver',
  },
  {
    id: 'toronto',
    name: 'Toronto',
    country: 'CA',
    lat: 43.6525,
    lon: -79.3817,
    wikiTitle: 'Toronto',
  },
  {
    id: 'montreal',
    name: 'Montréal',
    country: 'CA',
    lat: 45.5089,
    lon: -73.5542,
    wikiTitle: 'Montreal',
  },
  {
    id: 'new-york',
    name: 'New York',
    country: 'US',
    lat: 40.7128,
    lon: -74.0061,
    wikiTitle: 'New_York_City',
  },
  {
    id: 'mexico-city',
    name: 'Mexico City',
    country: 'MX',
    lat: 19.4333,
    lon: -99.1333,
    wikiTitle: 'Mexico_City',
  },
  { id: 'london', name: 'London', country: 'GB', lat: 51.5072, lon: -0.1275, wikiTitle: 'London' },
  { id: 'paris', name: 'Paris', country: 'FR', lat: 48.8567, lon: 2.3522, wikiTitle: 'Paris' },
  { id: 'berlin', name: 'Berlin', country: 'DE', lat: 52.52, lon: 13.405, wikiTitle: 'Berlin' },
  { id: 'tokyo', name: 'Tokyo', country: 'JP', lat: 35.6897, lon: 139.6922, wikiTitle: 'Tokyo' },
  { id: 'sydney', name: 'Sydney', country: 'AU', lat: -33.8678, lon: 151.21, wikiTitle: 'Sydney' },
];

export function findCity(id: string): City | undefined {
  return CITIES.find((city) => city.id === id);
}
