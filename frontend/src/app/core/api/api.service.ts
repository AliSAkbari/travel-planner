import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CityOption, CitySummary, CityWeather, LocationResult } from './api.models';

/**
 * Typed access to the backend's data endpoints. Paths are relative ("/api/..."),
 * so the same build works behind Firebase Hosting and behind the dev-server proxy.
 * The auth interceptor adds the bearer token; this service doesn't know about it.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getCities(): Observable<CityOption[]> {
    return this.http.get<CityOption[]>('/api/cities');
  }

  getLocation(): Observable<LocationResult> {
    return this.http.get<LocationResult>('/api/location');
  }

  getSummary(cityId: string): Observable<CitySummary> {
    return this.http.get<CitySummary>(`/api/cities/${encodeURIComponent(cityId)}/summary`);
  }

  getWeather(cityId: string): Observable<CityWeather> {
    return this.http.get<CityWeather>(`/api/cities/${encodeURIComponent(cityId)}/weather`);
  }
}
