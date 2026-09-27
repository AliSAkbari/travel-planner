import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import {
  IP2LOCATION_SAMPLE,
  jsonResponse,
  mockFetchByUrl,
  OPEN_METEO_SAMPLE,
  WIKIPEDIA_SAMPLE,
} from '../helpers/mockFetch.js';
import { makeTestConfig, TEST_PASSWORD, TEST_USERNAME } from '../helpers/testConfig.js';

// Every external provider, answering like the real APIs. Individual tests
// override a provider to simulate failures.
const HEALTHY_PROVIDERS = {
  'https://api.open-meteo.com/': () => jsonResponse(OPEN_METEO_SAMPLE),
  'https://en.wikipedia.org/': () => jsonResponse(WIKIPEDIA_SAMPLE),
  'https://api.ip2location.io/': () => jsonResponse(IP2LOCATION_SAMPLE),
};

let app: Express;
let auth: string;

/** A fresh app (fresh caches) and a valid token for each test. */
async function setUp(config = makeTestConfig()) {
  app = createApp(config);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  auth = `Bearer ${res.body.token as string}`;
}

beforeEach(async () => {
  mockFetchByUrl(HEALTHY_PROVIDERS);
  await setUp();
});

describe('data routes require a token', () => {
  it.each([
    '/api/cities',
    '/api/location',
    '/api/cities/calgary/summary',
    '/api/cities/calgary/weather',
  ])('GET %s -> 401 without a token', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });
});

describe('GET /api/cities', () => {
  it('lists the 12 selectable cities', async () => {
    const res = await request(app).get('/api/cities').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(12);
    expect(res.body[0]).toEqual({ id: 'calgary', name: 'Calgary', country: 'CA' });
  });
});

describe('GET /api/cities/:id/summary', () => {
  it('returns the Wikipedia summary for a known city', async () => {
    const res = await request(app).get('/api/cities/calgary/summary').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      cityId: 'calgary',
      extract: WIKIPEDIA_SAMPLE.extract,
      wikiUrl: 'https://en.wikipedia.org/wiki/Calgary',
    });
  });

  it('returns 404 CITY_NOT_FOUND without calling Wikipedia', async () => {
    const res = await request(app).get('/api/cities/atlantis/summary').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CITY_NOT_FOUND');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns 502 UPSTREAM_UNAVAILABLE when Wikipedia fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchByUrl({
      ...HEALTHY_PROVIDERS,
      'https://en.wikipedia.org/': () => jsonResponse({}, 503),
    });

    const res = await request(app).get('/api/cities/calgary/summary').set('Authorization', auth);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('GET /api/cities/:id/weather', () => {
  it('returns current conditions and 7 days', async () => {
    const res = await request(app).get('/api/cities/calgary/weather').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.current).toMatchObject({ temperatureC: 14.3, condition: 'partly-cloudy' });
    expect(res.body.daily).toHaveLength(7);
  });

  it('returns 404 for an unknown city', async () => {
    const res = await request(app).get('/api/cities/atlantis/weather').set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('returns 502 when Open-Meteo times out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchByUrl({
      ...HEALTHY_PROVIDERS,
      'https://api.open-meteo.com/': () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        });
      },
    });

    const res = await request(app).get('/api/cities/calgary/weather').set('Authorization', auth);

    expect(res.status).toBe(502);
  });

  it('is marked no-store', async () => {
    const res = await request(app).get('/api/cities/calgary/weather').set('Authorization', auth);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/location', () => {
  it('detects the client IP behind two trusted proxies and matches it', async () => {
    await setUp(makeTestConfig({ trustProxyHops: 2 }));
    const fetchSpy = mockFetchByUrl(HEALTHY_PROVIDERS);

    const res = await request(app)
      .get('/api/location')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '203.0.113.9, 198.51.100.1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      detected: {
        city: 'Calgary',
        region: 'Alberta',
        country: 'CA',
        lat: 51.05011,
        lon: -114.08529,
      },
      cityId: 'calgary',
      match: 'nearest',
      distanceKm: 2,
    });
    expect(new URL(String(fetchSpy.mock.calls[0]![0])).searchParams.get('ip')).toBe('203.0.113.9');
  });

  it('still returns 200 with the default city when the provider fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await setUp(makeTestConfig({ trustProxyHops: 1 }));
    mockFetchByUrl({
      ...HEALTHY_PROVIDERS,
      'https://api.ip2location.io/': () => jsonResponse({ error: 'rate limited' }, 429),
    });

    const res = await request(app)
      .get('/api/location')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '203.0.113.9');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      detected: null,
      cityId: 'calgary',
      match: 'default',
      distanceKm: null,
    });
  });

  it('sends the API key when one is configured', async () => {
    await setUp(makeTestConfig({ trustProxyHops: 1, ip2locationApiKey: 'ABCDEF0123456789' }));
    const fetchSpy = mockFetchByUrl(HEALTHY_PROVIDERS);

    await request(app)
      .get('/api/location')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '203.0.113.9');

    expect(new URL(String(fetchSpy.mock.calls[0]![0])).searchParams.get('key')).toBe(
      'ABCDEF0123456789',
    );
  });
});
