import { vi } from 'vitest';

/** Makes the next fetch calls resolve with this JSON body (a fresh Response per call). */
export function mockFetchJson(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

/**
 * Routes fetch calls by URL prefix, so an integration test can fake several
 * providers at once. Unmatched URLs fail loudly, so no real network call slips through.
 */
export function mockFetchByUrl(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    const match = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!match) return Promise.reject(new Error(`Unmocked fetch: ${url}`));
    return Promise.resolve(routes[match]!());
  });
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Real Open-Meteo response for Calgary, captured 2026-09-27 (trimmed to the requested fields). */
export const OPEN_METEO_SAMPLE = {
  timezone: 'America/Edmonton',
  current: {
    time: '2026-09-27T17:00',
    temperature_2m: 14.3,
    apparent_temperature: 10.3,
    relative_humidity_2m: 30,
    wind_speed_10m: 10.4,
    weather_code: 1,
    is_day: 1,
  },
  daily: {
    time: [
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ],
    weather_code: [3, 3, 3, 73, 3, 3, 3],
    temperature_2m_max: [14.4, 18.4, 19.7, 11.2, 13.2, 13.2, 17.4],
    temperature_2m_min: [-2.0, 1.8, 5.9, 2.2, 2.6, 3.1, 6.9],
    precipitation_probability_max: [1, 3, 43, 62, 4, 7, null],
  },
};

/** Real Wikipedia summary fields for Calgary (extract shortened). */
export const WIKIPEDIA_SAMPLE = {
  type: 'standard',
  title: 'Calgary',
  description: 'City in Alberta, Canada',
  extract: 'Calgary is a major city in the Canadian province of Alberta.',
  thumbnail: { source: 'https://upload.wikimedia.org/calgary.jpg', width: 330, height: 220 },
  content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Calgary' } },
};

/** Real ip2location.io response shape (values for a Calgary address). */
export const IP2LOCATION_SAMPLE = {
  ip: '203.0.113.9',
  country_code: 'CA',
  country_name: 'Canada',
  region_name: 'Alberta',
  city_name: 'Calgary',
  latitude: 51.05011,
  longitude: -114.08529,
  is_proxy: false,
};
