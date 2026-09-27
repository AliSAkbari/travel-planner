import { describe, expect, it } from 'vitest';
import { CITIES, DEFAULT_CITY_ID, findCity } from '../../../src/data/cities.js';
import { distanceKm } from '../../../src/utils/geo.js';
import { isPublicIp, normalizeIp } from '../../../src/utils/ipAddress.js';

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm({ lat: 51, lon: -114 }, { lat: 51, lon: -114 })).toBe(0);
  });

  it('matches known distances within 1%', () => {
    const calgary = findCity('calgary')!;
    const edmonton = findCity('edmonton')!;
    // Calgary–Edmonton is about 280 km in a straight line.
    expect(distanceKm(calgary, edmonton)).toBeCloseTo(281, -1);
    // Airdrie (51.2917, -114.0144) to central Calgary: about 27 km.
    expect(distanceKm({ lat: 51.2917, lon: -114.0144 }, calgary)).toBeCloseTo(27.4, 1);
  });

  it('is symmetric', () => {
    const [a, b] = [findCity('tokyo')!, findCity('sydney')!];
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });
});

describe('city list', () => {
  it('has unique ids and contains the default city', () => {
    const ids = CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findCity(DEFAULT_CITY_ID)?.name).toBe('Calgary');
  });

  it('returns undefined for an unknown id', () => {
    expect(findCity('atlantis')).toBeUndefined();
  });
});

describe('normalizeIp', () => {
  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('::FFFF:127.0.0.1')).toBe('127.0.0.1');
  });

  it('leaves other addresses unchanged', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });
});

describe('isPublicIp', () => {
  it.each(['8.8.8.8', '204.191.184.232', '2001:4860:4860::8888'])('accepts public %s', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.1.1',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd12:3456::1',
    'fe80::1',
    'not-an-ip',
    '',
  ])('rejects non-public %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it('treats 172.32.0.1 (just outside 172.16/12) as public', () => {
    expect(isPublicIp('172.32.0.1')).toBe(true);
  });
});
