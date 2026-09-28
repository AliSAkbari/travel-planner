import { Component, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { CityWeather } from '../../core/api/api.models';
import type { Loadable } from '../../shared/loadable';
import { formatCelsius, weatherIcon } from '../../shared/weather-display';
import { LoadStatus } from './load-status';

/** Current conditions in the selected city. */
@Component({
  selector: 'app-current-weather-card',
  imports: [MatCardModule, MatIconModule, LoadStatus],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title
          ><h2>Weather now in {{ cityName() }}</h2></mat-card-title
        >
      </mat-card-header>
      <mat-card-content>
        @let s = state();
        @if (s.status === 'ok') {
          @let now = s.data.current;
          <div class="now">
            <!-- The icon is decorative: the label next to it says the same thing. -->
            <mat-icon class="icon" [svgIcon]="icon(now.condition)" aria-hidden="true" />
            <div>
              <p class="temperature">{{ celsius(now.temperatureC) }}</p>
              <p class="label">{{ now.label }}</p>
            </div>
          </div>
          <!-- A description list: screen readers announce each value with its term. -->
          <dl class="details">
            <div>
              <dt>Feels like</dt>
              <dd>{{ celsius(now.feelsLikeC) }}</dd>
            </div>
            <div>
              <dt><mat-icon svgIcon="water_drop" aria-hidden="true" />Humidity</dt>
              <dd>{{ now.humidityPercent }}%</dd>
            </div>
            <div>
              <dt><mat-icon svgIcon="air" aria-hidden="true" />Wind</dt>
              <dd>{{ round(now.windKmh) }} km/h</dd>
            </div>
          </dl>
        } @else if (s.status === 'error') {
          <app-load-status what="current weather" [error]="s.message" (retry)="retry.emit()" />
        } @else {
          <app-load-status what="current weather" />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    h2 {
      margin: 0;
      font: var(--mat-sys-title-large);
    }
    .now {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 8px 0 16px;
    }
    .icon {
      width: 72px;
      height: 72px;
      color: var(--mat-sys-primary);
    }
    .temperature {
      margin: 0;
      font: var(--mat-sys-display-small);
    }
    .label {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .details {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 0;
    }
    dt {
      display: flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    dt mat-icon {
      width: 18px;
      height: 18px;
    }
    dd {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class CurrentWeatherCard {
  readonly state = input.required<Loadable<CityWeather>>();
  readonly cityName = input.required<string>();
  readonly retry = output();

  // Plain functions exposed to the template (templates can't call imports directly).
  protected readonly icon = weatherIcon;
  protected readonly celsius = formatCelsius;
  protected readonly round = Math.round;
}
