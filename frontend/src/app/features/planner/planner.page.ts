import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { filter, type Observable, switchMap } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { LOADING, type Loadable, toLoadable } from '../../shared/loadable';
import { FALLBACK_CITY_ID, locationMessage } from '../../shared/location-message';
import { CurrentWeatherCard } from './current-weather-card';
import { ForecastCard } from './forecast-card';
import { SummaryCard } from './summary-card';

/**
 * The main page: pick a city, see its description, current weather and week.
 *
 * Signals hold the UI state (what's selected, what each card shows).
 * RxJS handles the requests: switchMap cancels the previous city's requests
 * when the selection changes, so a slow response can never overwrite a newer one.
 */
@Component({
  selector: 'app-planner-page',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    SummaryCard,
    CurrentWeatherCard,
    ForecastCard,
  ],
  templateUrl: './planner.page.html',
  styleUrl: './planner.page.scss',
})
export class PlannerPage {
  private readonly api = inject(ApiService);

  protected readonly cities = toSignal(this.api.getCities().pipe(toLoadable()), {
    initialValue: LOADING,
  });
  protected readonly location = toSignal(this.api.getLocation().pipe(toLoadable()), {
    initialValue: LOADING,
  });

  /**
   * The selected city. linkedSignal: it starts as the detected city (or the
   * fallback if detection failed), and the user's choice then overrides it.
   * Null until detection finishes, so nothing loads for a city the user
   * didn't pick and wasn't detected.
   */
  protected readonly selectedCityId = linkedSignal<string | null>(() => {
    const location = this.location();
    if (location.status === 'loading') return null;
    return location.status === 'ok' ? location.data.cityId : FALLBACK_CITY_ID;
  });

  /** Bumped by "Try again" to re-run the requests for the same city. */
  private readonly reloadCount = signal(0);

  protected readonly summary = this.loadForSelectedCity((id) => this.api.getSummary(id));
  protected readonly weather = this.loadForSelectedCity((id) => this.api.getWeather(id));

  protected readonly selectedCityName = computed(() => this.cityName(this.selectedCityId()));

  protected readonly bannerMessage = computed(() => {
    const location = this.location();
    if (location.status === 'loading') return null;
    return locationMessage(location.status === 'ok' ? location.data : null, (id) =>
      this.cityName(id),
    );
  });

  protected retry(): void {
    this.reloadCount.update((n) => n + 1);
  }

  private cityName(id: string | null): string {
    const cities = this.cities();
    const city = cities.status === 'ok' ? cities.data.find((c) => c.id === id) : undefined;
    return city?.name ?? '';
  }

  /**
   * Runs `load` for the selected city, again whenever the selection (or the
   * retry counter) changes. switchMap unsubscribes from the previous request,
   * which makes HttpClient abort it.
   */
  private loadForSelectedCity<T>(load: (cityId: string) => Observable<T>) {
    const trigger = computed(() => ({
      cityId: this.selectedCityId(),
      attempt: this.reloadCount(),
    }));
    return toSignal(
      toObservable(trigger).pipe(
        filter((t): t is { cityId: string; attempt: number } => t.cityId !== null),
        switchMap(({ cityId }) => load(cityId).pipe(toLoadable())),
      ),
      { initialValue: LOADING as Loadable<T> },
    );
  }
}
