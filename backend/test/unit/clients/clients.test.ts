import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, UpstreamError } from '../../../src/clients/http.js';
import { createIp2LocationLookup } from '../../../src/clients/ip2location.client.js';
import { fetchForecast } from '../../../src/clients/openMeteo.client.js';
import { fetchSummary } from '../../../src/clients/wikipedia.client.js';
import {
  IP2LOCATION_SAMPLE,
  mockFetchJson,
  OPEN_METEO_SAMPLE,
  WIKIPEDIA_SAMPLE,
} from '../../helpers/mockFetch.js';

/** The URL of the n-th fetch call. */
const calledUrl = (spy: ReturnType<typeof mockFetchJson>, n = 0) =>
  new URL(String(spy.mock.calls[n]![0]));

describe('fetchJson', () => {
  const schema = z.object({ ok: z.boolean() });

  it('returns the validated body', async () => {
    mockFetchJson({ ok: true, extra: 'ignored' });
    expect(await fetchJson('test', 'https://x.test', schema)).toEqual({ ok: true });
  });

  it('passes a timeout signal and custom headers', async () => {
    const spy = mockFetchJson({ ok: true });
    await fetchJson('test', 'https://x.test', schema, { 'User-Agent': 'ua' });
    expect(spy).toHaveBeenCalledWith('https://x.test', {
      headers: { 'User-Agent': 'ua' },
      signal: expect.any(AbortSignal),
    });
  });

  it('throws UpstreamError with the status for a non-2xx response', async () => {
    mockFetchJson({ error: true }, 503);
    const err = await fetchJson('test', 'https://x.test', schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).toMatchObject({ provider: 'test', status: 503, message: 'test: HTTP 503' });
  });

  it('throws UpstreamError for a network error or timeout', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);
    await expect(fetchJson('test', 'https://x.test', schema)).rejects.toThrow(
      'test: The operation was aborted due to timeout',
    );
  });

  it('throws UpstreamError for a body that is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>oops</html>'));
    await expect(fetchJson('test', 'https://x.test', schema)).rejects.toThrow('not valid JSON');
  });

  it('throws UpstreamError when the shape is unexpected', async () => {
    mockFetchJson({ ok: 'yes' });
    await expect(fetchJson('test', 'https://x.test', schema)).rejects.toThrow(
      'unexpected response shape',
    );
  });
});

describe('fetchForecast (Open-Meteo)', () => {
  it('requests current + 7 daily values in the city timezone and parses the response', async () => {
    const spy = mockFetchJson(OPEN_METEO_SAMPLE);

    const forecast = await fetchForecast(51.0475, -114.0625);

    const url = calledUrl(spy);
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('51.0475');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('forecast_days')).toBe('7');
    expect(forecast.daily.time).toHaveLength(7);
    expect(forecast.daily.precipitation_probability_max[6]).toBeNull();
  });

  it("rejects Open-Meteo's error body", async () => {
    mockFetchJson({ error: true, reason: 'Latitude must be in range of -90 to 90°.' }, 400);
    await expect(fetchForecast(999, 0)).rejects.toMatchObject({
      provider: 'open-meteo',
      status: 400,
    });
  });
});

describe('fetchSummary (Wikipedia)', () => {
  it('sends the identifying User-Agent and encodes the title', async () => {
    const spy = mockFetchJson(WIKIPEDIA_SAMPLE);

    const summary = await fetchSummary('New_York_City');

    expect(String(spy.mock.calls[0]![0])).toBe(
      'https://en.wikipedia.org/api/rest_v1/page/summary/New_York_City',
    );
    expect(spy.mock.calls[0]![1]).toMatchObject({
      headers: { 'User-Agent': expect.stringContaining('TravelPlanner') },
    });
    expect(summary.extract).toContain('Calgary');
  });

  it('accepts a summary without description or thumbnail', async () => {
    mockFetchJson({ ...WIKIPEDIA_SAMPLE, description: undefined, thumbnail: undefined });
    expect((await fetchSummary('Calgary')).thumbnail).toBeUndefined();
  });

  it('turns a 404 into UpstreamError', async () => {
    mockFetchJson({ status: 404, type: 'Internal error' }, 404);
    await expect(fetchSummary('Nope')).rejects.toMatchObject({
      provider: 'wikipedia',
      status: 404,
    });
  });
});

describe('createIp2LocationLookup', () => {
  it('maps a successful lookup', async () => {
    mockFetchJson(IP2LOCATION_SAMPLE);
    expect(await createIp2LocationLookup()('203.0.113.9')).toEqual({
      city: 'Calgary',
      region: 'Alberta',
      country: 'CA',
      lat: 51.05011,
      lon: -114.08529,
    });
  });

  it('sends no key when none is configured', async () => {
    const spy = mockFetchJson(IP2LOCATION_SAMPLE);
    await createIp2LocationLookup()('203.0.113.9');
    expect(calledUrl(spy).searchParams.has('key')).toBe(false);
    expect(calledUrl(spy).searchParams.get('ip')).toBe('203.0.113.9');
  });

  it('adds the key when configured', async () => {
    const spy = mockFetchJson(IP2LOCATION_SAMPLE);
    await createIp2LocationLookup('ABC123')('203.0.113.9');
    expect(calledUrl(spy).searchParams.get('key')).toBe('ABC123');
  });

  it('omits the ip parameter to locate the caller itself', async () => {
    const spy = mockFetchJson(IP2LOCATION_SAMPLE);
    await createIp2LocationLookup()();
    expect(calledUrl(spy).searchParams.has('ip')).toBe(false);
  });

  it('returns null when the provider cannot place the address (all fields null)', async () => {
    mockFetchJson({
      ...IP2LOCATION_SAMPLE,
      city_name: null,
      region_name: null,
      country_code: null,
      latitude: null,
      longitude: null,
    });
    expect(await createIp2LocationLookup()('192.168.1.1')).toBeNull();
  });

  it('throws UpstreamError for an invalid key, without the key in the message', async () => {
    mockFetchJson({ error: { error_code: 10000, error_message: 'Invalid API key.' } }, 401);
    const err = await createIp2LocationLookup('SECRET-KEY')('203.0.113.9').catch((e: unknown) => e);
    expect(err).toMatchObject({ provider: 'ip2location', status: 401 });
    expect(String((err as Error).message)).not.toContain('SECRET-KEY');
  });
});
