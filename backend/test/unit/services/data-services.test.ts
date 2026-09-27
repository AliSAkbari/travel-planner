import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpstreamError } from '../../../src/clients/http.js';
import type { GeoLocation } from '../../../src/clients/ip2location.client.js';
import { findCity } from '../../../src/data/cities.js';
import { createCityService } from '../../../src/services/city.service.js';
import {
  createLocationService,
  matchToCity,
  MAX_MATCH_DISTANCE_KM,
} from '../../../src/services/location.service.js';
import { createWeatherService, toCityWeather } from '../../../src/services/weather.service.js';
import { describeWeather } from '../../../src/services/weatherCodes.js';
import { OPEN_METEO_SAMPLE, WIKIPEDIA_SAMPLE } from '../../helpers/mockFetch.js';

const calgary = findCity('calgary')!;

afterEach(() => {
  vi.useRealTimers();
});

describe('describeWeather', () => {
  it.each([
    [0, 'clear', 'Clear sky'],
    [2, 'partly-cloudy', 'Partly cloudy'],
    [45, 'fog', 'Fog'],
    [73, 'snow', 'Moderate snowfall'],
    [99, 'thunderstorm', 'Thunderstorm with heavy hail'],
  ])('maps WMO code %i', (code, condition, label) => {
    expect(describeWeather(code)).toEqual({ condition, label });
  });

  it('degrades gracefully for codes not in the table', () => {
    expect(describeWeather(97)).toEqual({ condition: 'unknown', label: 'Unknown conditions' });
  });
});

describe('weather service', () => {
  it('maps current conditions and zips the daily arrays into 7 days', () => {
    const weather = toCityWeather('calgary', OPEN_METEO_SAMPLE);

    expect(weather.timezone).toBe('America/Edmonton');
    expect(weather.current).toEqual({
      time: '2026-09-27T17:00',
      temperatureC: 14.3,
      feelsLikeC: 10.3,
      humidityPercent: 30,
      windKmh: 10.4,
      isDay: true,
      condition: 'partly-cloudy',
      label: 'Mainly clear',
    });
    expect(weather.daily).toHaveLength(7);
    expect(weather.daily[3]).toEqual({
      date: '2026-09-30',
      minC: 2.2,
      maxC: 11.2,
      precipitationChancePercent: 62,
      condition: 'snow',
      label: 'Moderate snowfall',
    });
    expect(weather.daily[6]!.precipitationChancePercent).toBeNull();
  });

  it('rejects daily arrays of different lengths instead of rendering gaps', () => {
    const broken = {
      ...OPEN_METEO_SAMPLE,
      daily: { ...OPEN_METEO_SAMPLE.daily, temperature_2m_max: [1, 2] },
    };
    expect(() => toCityWeather('calgary', broken)).toThrow(UpstreamError);
  });

  it('fetches by city coordinates and caches for 10 minutes', async () => {
    vi.useFakeTimers();
    const fetchForecast = vi.fn().mockResolvedValue(OPEN_METEO_SAMPLE);
    const service = createWeatherService({ fetchForecast });

    await service.getWeather(calgary);
    await service.getWeather(calgary);
    expect(fetchForecast).toHaveBeenCalledOnce();
    expect(fetchForecast).toHaveBeenCalledWith(calgary.lat, calgary.lon);

    vi.advanceTimersByTime(10 * 60 * 1000);
    await service.getWeather(calgary);
    expect(fetchForecast).toHaveBeenCalledTimes(2);
  });

  it('propagates upstream failures (mapped to 502 by errorHandler)', async () => {
    const service = createWeatherService({
      fetchForecast: vi.fn().mockRejectedValue(new UpstreamError('open-meteo', 'HTTP 503', 503)),
    });
    await expect(service.getWeather(calgary)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('city service', () => {
  it('lists cities without internal fields', () => {
    const service = createCityService({ fetchSummary: vi.fn() });
    expect(service.listCities()[0]).toEqual({ id: 'calgary', name: 'Calgary', country: 'CA' });
  });

  it('throws 404 CITY_NOT_FOUND for an unknown id', () => {
    const service = createCityService({ fetchSummary: vi.fn() });
    expect(() => service.getCity('atlantis')).toThrow(
      expect.objectContaining({ status: 404, code: 'CITY_NOT_FOUND' }),
    );
  });

  it('maps the Wikipedia summary, using the exact article title, and caches it', async () => {
    const fetchSummary = vi.fn().mockResolvedValue(WIKIPEDIA_SAMPLE);
    const service = createCityService({ fetchSummary });
    const newYork = service.getCity('new-york');

    const summary = await service.getSummary(newYork);
    await service.getSummary(newYork);

    expect(fetchSummary).toHaveBeenCalledOnce();
    expect(fetchSummary).toHaveBeenCalledWith('New_York_City');
    expect(summary).toEqual({
      cityId: 'new-york',
      title: 'Calgary',
      description: 'City in Alberta, Canada',
      extract: WIKIPEDIA_SAMPLE.extract,
      thumbnailUrl: 'https://upload.wikimedia.org/calgary.jpg',
      wikiUrl: 'https://en.wikipedia.org/wiki/Calgary',
    });
  });

  it('uses null for a missing description or thumbnail', async () => {
    const bare = { ...WIKIPEDIA_SAMPLE, description: undefined, thumbnail: undefined };
    const service = createCityService({ fetchSummary: vi.fn().mockResolvedValue(bare) });

    const summary = await service.getSummary(calgary);

    expect(summary.description).toBeNull();
    expect(summary.thumbnailUrl).toBeNull();
  });
});

describe('matchToCity', () => {
  const at = (lat: number, lon: number, city = 'Somewhere'): GeoLocation => ({
    city,
    region: null,
    country: null,
    lat,
    lon,
  });

  it('picks the nearest listed city within range and keeps what was detected', () => {
    const airdrie = at(51.2917, -114.0144, 'Airdrie');
    expect(matchToCity(airdrie)).toEqual({
      detected: airdrie,
      cityId: 'calgary',
      match: 'nearest',
      distanceKm: 27,
    });
  });

  it('matches the closer of two listed cities (Red Deer sits between Calgary and Edmonton)', () => {
    // Red Deer (52.2681, -113.8112) is ~137 km from Calgary and ~143 km from Edmonton.
    expect(matchToCity(at(52.2681, -113.8112)).cityId).toBe('calgary');
  });

  it('falls back to Calgary beyond 150 km, still reporting the detected place', () => {
    const lisbon = at(38.7223, -9.1393, 'Lisbon');
    expect(matchToCity(lisbon)).toEqual({
      detected: lisbon,
      cityId: 'calgary',
      match: 'default',
      distanceKm: null,
    });
  });

  it('treats exactly the limit as in range', () => {
    // Move due north from Calgary by exactly MAX_MATCH_DISTANCE_KM (1° latitude ≈ 111.19 km).
    const lat = calgary.lat + MAX_MATCH_DISTANCE_KM / 111.195 - 1e-9;
    expect(matchToCity(at(lat, calgary.lon)).match).toBe('nearest');
  });

  it('uses the default when nothing was detected', () => {
    expect(matchToCity(null)).toEqual({
      detected: null,
      cityId: 'calgary',
      match: 'default',
      distanceKm: null,
    });
  });
});

describe('location service', () => {
  const edmontonUser: GeoLocation = {
    city: 'Edmonton',
    region: 'Alberta',
    country: 'CA',
    lat: 53.55,
    lon: -113.49,
  };

  it('looks up a public client IP and matches it', async () => {
    const lookupIp = vi.fn().mockResolvedValue(edmontonUser);
    const service = createLocationService({ lookupIp, isProduction: true });

    const result = await service.detect('203.0.113.9');

    expect(lookupIp).toHaveBeenCalledWith('203.0.113.9');
    expect(result).toMatchObject({ cityId: 'edmonton', match: 'nearest', detected: edmontonUser });
  });

  it('unwraps an IPv4-mapped address before looking it up', async () => {
    const lookupIp = vi.fn().mockResolvedValue(edmontonUser);
    await createLocationService({ lookupIp, isProduction: true }).detect('::ffff:203.0.113.9');
    expect(lookupIp).toHaveBeenCalledWith('203.0.113.9');
  });

  it('in production, skips the lookup for a private IP and uses the default', async () => {
    const lookupIp = vi.fn();
    const service = createLocationService({ lookupIp, isProduction: true });

    expect(await service.detect('10.0.0.5')).toMatchObject({ detected: null, cityId: 'calgary' });
    expect(await service.detect(undefined)).toMatchObject({ detected: null, cityId: 'calgary' });
    expect(lookupIp).not.toHaveBeenCalled();
  });

  it("outside production, a private IP looks up the machine's own public IP", async () => {
    const lookupIp = vi.fn().mockResolvedValue(edmontonUser);
    const service = createLocationService({ lookupIp, isProduction: false });

    const result = await service.detect('::1');

    expect(lookupIp).toHaveBeenCalledWith(undefined);
    expect(result.cityId).toBe('edmonton');
  });

  it('never throws: a provider failure falls back to the default and is not cached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const lookupIp = vi
      .fn()
      .mockRejectedValueOnce(new UpstreamError('ip2location', 'HTTP 429', 429))
      .mockResolvedValueOnce(edmontonUser);
    const service = createLocationService({ lookupIp, isProduction: true });

    expect(await service.detect('203.0.113.9')).toMatchObject({
      detected: null,
      cityId: 'calgary',
    });
    expect((await service.detect('203.0.113.9')).cityId).toBe('edmonton');
  });

  it('caches results per IP', async () => {
    const lookupIp = vi.fn().mockResolvedValue(edmontonUser);
    const service = createLocationService({ lookupIp, isProduction: true });

    await service.detect('203.0.113.9');
    await service.detect('203.0.113.9');
    await service.detect('198.51.100.7');

    expect(lookupIp).toHaveBeenCalledTimes(2);
  });
});
