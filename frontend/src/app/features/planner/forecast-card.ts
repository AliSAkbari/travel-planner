import { Component, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { CityWeather } from '../../core/api/api.models';
import type { Loadable } from '../../shared/loadable';
import { dayLabel, formatCelsius, fullDate, weatherIcon } from '../../shared/weather-display';
import { LoadStatus } from './load-status';

/** The rolling week: today + the next 6 days, in the city's own calendar. */
@Component({
  selector: 'app-forecast-card',
  imports: [MatCardModule, MatIconModule, LoadStatus],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title><h2>7-day forecast</h2></mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @let s = state();
        @if (s.status === 'ok') {
          <ol class="days">
            @for (day of s.data.daily; track day.date; let i = $index) {
              <li
                class="day"
                [attr.aria-label]="describe(day.date, i, day.label, day.maxC, day.minC)"
              >
                <!-- Visual layout; the aria-label above reads the whole day as one sentence. -->
                <span class="name" [title]="full(day.date)" aria-hidden="true">{{
                  label(day.date, i)
                }}</span>
                <mat-icon [svgIcon]="icon(day.condition)" [title]="day.label" aria-hidden="true" />
                <span class="max" aria-hidden="true">{{ celsius(day.maxC) }}</span>
                <span class="min" aria-hidden="true">{{ celsius(day.minC) }}</span>
                @if (day.precipitationChancePercent !== null) {
                  <span class="rain" aria-hidden="true">
                    <mat-icon svgIcon="water_drop" />{{ day.precipitationChancePercent }}%
                  </span>
                }
              </li>
            }
          </ol>
        } @else if (s.status === 'error') {
          <app-load-status what="forecast" [error]="s.message" (retry)="retry.emit()" />
        } @else {
          <app-load-status what="forecast" />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    h2 {
      margin: 0;
      font: var(--mat-sys-title-large);
    }
    .days {
      display: grid;
      // 7 columns when there is room; on a phone as many as fit (4 + 3).
      grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
      gap: 8px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .day {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 4px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }
    .day:first-child {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .name {
      font: var(--mat-sys-label-large);
    }
    mat-icon {
      width: 36px;
      height: 36px;
    }
    .max {
      font: var(--mat-sys-title-small);
    }
    .min {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .day:first-child .min {
      color: inherit;
    }
    .rain {
      display: flex;
      align-items: center;
      font: var(--mat-sys-label-small);
    }
    .rain mat-icon {
      width: 14px;
      height: 14px;
    }
  `,
})
export class ForecastCard {
  readonly state = input.required<Loadable<CityWeather>>();
  readonly retry = output();

  protected readonly icon = weatherIcon;
  protected readonly celsius = formatCelsius;
  protected readonly label = dayLabel;
  protected readonly full = fullDate;

  /** One sentence per day for screen readers, e.g. "Today: Overcast, high 18 °C, low 2 °C". */
  protected describe(
    date: string,
    index: number,
    condition: string,
    max: number,
    min: number,
  ): string {
    const day = index === 0 ? 'Today' : fullDate(date);
    return `${day}: ${condition}, high ${formatCelsius(max)}, low ${formatCelsius(min)}`;
  }
}
