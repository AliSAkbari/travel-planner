import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatIconTestingModule } from '@angular/material/icon/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CityWeather, LocationResult } from '../../core/api/api.models';
import { PlannerPage } from './planner.page';

const CITIES = [
  { id: 'calgary', name: 'Calgary', country: 'CA' },
  { id: 'tokyo', name: 'Tokyo', country: 'JP' },
];
const LOCATION: LocationResult = {
  detected: { city: 'Airdrie', region: 'Alberta', country: 'CA', lat: 51.29, lon: -114.01 },
  cityId: 'calgary',
  match: 'nearest',
  distanceKm: 27,
};
const day = (date: string) => ({
  date,
  minC: 1,
  maxC: 10,
  precipitationChancePercent: 5,
  condition: 'cloudy' as const,
  label: 'Overcast',
});
const WEATHER: CityWeather = {
  cityId: 'calgary',
  timezone: 'America/Edmonton',
  current: {
    time: '2026-09-27T17:00',
    temperatureC: 14.3,
    feelsLikeC: 10.3,
    humidityPercent: 30,
    windKmh: 10.4,
    isDay: true,
    condition: 'cloudy',
    label: 'Overcast',
  },
  daily: ['27', '28', '29', '30'].map((d) => day(`2026-09-${d}`)),
};

describe('PlannerPage', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlannerPage, MatIconTestingModule], // fake icon registry: no SVG requests
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  async function renderWithLocation() {
    const fixture = TestBed.createComponent(PlannerPage);
    fixture.detectChanges();
    backend.expectOne('/api/cities').flush(CITIES);
    backend.expectOne('/api/location').flush(LOCATION);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('pre-selects the detected city and explains the choice in the banner', async () => {
    const fixture = await renderWithLocation();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.banner')?.textContent).toContain(
      'Detected: Airdrie, Alberta — showing nearest: Calgary (27 km)',
    );
    backend.expectOne('/api/cities/calgary/summary');
    backend.expectOne('/api/cities/calgary/weather');
  });

  it('renders the forecast with "Today", weekday names and °C', async () => {
    const fixture = await renderWithLocation();
    backend.expectOne('/api/cities/calgary/summary').flush({
      cityId: 'calgary',
      title: 'Calgary',
      description: null,
      extract: 'A city.',
      thumbnailUrl: null,
      wikiUrl: 'https://en.wikipedia.org/wiki/Calgary',
    });
    backend.expectOne('/api/cities/calgary/weather').flush(WEATHER);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const names = [...el.querySelectorAll('.day .name')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['Today', 'Mon', 'Tue', 'Wed']);
    expect(el.querySelector('.temperature')?.textContent?.trim()).toBe('14 °C');
  });

  it("cancels the previous city's requests when the selection changes (switchMap)", async () => {
    const fixture = await renderWithLocation();
    const calgaryWeather = backend.expectOne('/api/cities/calgary/weather');
    backend.expectOne('/api/cities/calgary/summary');

    // Simulate the user picking another city while Calgary is still loading.
    (
      fixture.componentInstance as unknown as { selectedCityId: { set(v: string): void } }
    ).selectedCityId.set('tokyo');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(calgaryWeather.cancelled).toBe(true);
    backend.expectOne('/api/cities/tokyo/weather');
    backend.expectOne('/api/cities/tokyo/summary');
  });

  it('shows an error with a retry button when weather fails, and retries', async () => {
    const fixture = await renderWithLocation();
    backend.expectOne('/api/cities/calgary/summary');
    backend.expectOne('/api/cities/calgary/weather').flush(
      {
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'A data provider is unavailable. Please try again shortly.',
        },
      },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const alert = el.querySelector('app-current-weather-card [role="alert"]');
    expect(alert?.textContent).toContain('A data provider is unavailable');

    (alert?.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    backend.expectOne('/api/cities/calgary/weather');
  });
});
