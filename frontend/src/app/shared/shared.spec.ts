import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { LocationResult } from '../core/api/api.models';
import { errorMessage, toLoadable } from './loadable';
import { locationMessage } from './location-message';
import { dayLabel, formatCelsius, fullDate, weatherIcon } from './weather-display';

const names: Record<string, string> = { calgary: 'Calgary', edmonton: 'Edmonton' };
const cityName = (id: string) => names[id] ?? id;

describe('locationMessage (the three cases in docs/ARCHITECTURE.md §5.3)', () => {
  it('nearest match', () => {
    const location: LocationResult = {
      detected: { city: 'Airdrie', region: 'Alberta', country: 'CA', lat: 51.29, lon: -114.01 },
      cityId: 'calgary',
      match: 'nearest',
      distanceKm: 27,
    };
    expect(locationMessage(location, cityName)).toBe(
      'Detected: Airdrie, Alberta — showing nearest: Calgary (27 km)',
    );
  });

  it('too far away, so the default', () => {
    const location: LocationResult = {
      detected: { city: 'Lisbon', region: null, country: 'PT', lat: 38.7, lon: -9.1 },
      cityId: 'calgary',
      match: 'default',
      distanceKm: null,
    };
    expect(locationMessage(location, cityName)).toBe(
      'Detected: Lisbon — no listed city nearby, showing default: Calgary',
    );
  });

  it('lookup failed (backend fallback)', () => {
    const location: LocationResult = {
      detected: null,
      cityId: 'calgary',
      match: 'default',
      distanceKm: null,
    };
    expect(locationMessage(location, cityName)).toBe(
      "Couldn't detect your location — showing default: Calgary",
    );
  });

  it('location request itself failed', () => {
    expect(locationMessage(null, cityName)).toBe(
      "Couldn't detect your location — showing default: Calgary",
    );
  });
});

describe('weather display helpers', () => {
  it('labels the first day "Today" and the rest by short weekday', () => {
    expect(dayLabel('2026-09-27', 0)).toBe('Today');
    expect(dayLabel('2026-09-28', 1)).toBe('Mon');
    expect(dayLabel('2026-10-03', 6)).toBe('Sat');
  });

  it('gives the full date for screen readers', () => {
    expect(fullDate('2026-09-28')).toBe('Monday, September 28');
  });

  it('formats Celsius with the unit, rounded, without "-0"', () => {
    expect(formatCelsius(14.3)).toBe('14 °C');
    expect(formatCelsius(-2.5)).toBe('-2 °C');
    expect(formatCelsius(-0.4)).toBe('0 °C');
  });

  it('has an icon for every condition', () => {
    expect(weatherIcon('clear')).toBe('sunny');
    expect(weatherIcon('snow')).toBe('weather_snowy');
    expect(weatherIcon('unknown')).toBe('help');
  });
});

describe('toLoadable', () => {
  it('emits loading, then ok', async () => {
    const states = await new Promise((resolve) =>
      of(42).pipe(toLoadable(), toArray()).subscribe(resolve),
    );
    expect(states).toEqual([{ status: 'loading' }, { status: 'ok', data: 42 }]);
  });

  it('emits loading, then an error with the API message', async () => {
    const error = new HttpErrorResponse({
      status: 404,
      error: { error: { code: 'CITY_NOT_FOUND', message: 'Unknown city: atlantis' } },
    });
    const states = await new Promise((resolve) =>
      throwError(() => error)
        .pipe(toLoadable(), toArray())
        .subscribe(resolve),
    );
    expect(states).toEqual([
      { status: 'loading' },
      { status: 'error', message: 'Unknown city: atlantis' },
    ]);
  });

  it('explains network failures', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain("Can't reach the server");
    expect(errorMessage(new Error('x'))).toBe('Something went wrong. Please try again.');
  });
});
