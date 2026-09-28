import { Component, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import type { CitySummary } from '../../core/api/api.models';
import type { Loadable } from '../../shared/loadable';
import { LoadStatus } from './load-status';

/** The city's Wikipedia introduction. */
@Component({
  selector: 'app-summary-card',
  imports: [MatCardModule, LoadStatus],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title
          ><h2>About {{ cityName() }}</h2></mat-card-title
        >
      </mat-card-header>
      <mat-card-content>
        <!-- Strict template checking narrows the union: s.data exists only when status is 'ok'. -->
        @let s = state();
        @if (s.status === 'ok') {
          @if (s.data.thumbnailUrl) {
            <img class="thumbnail" [src]="s.data.thumbnailUrl" [alt]="'Photo of ' + s.data.title" />
          }
          @if (s.data.description) {
            <p class="description">{{ s.data.description }}</p>
          }
          <!-- Interpolated as text: Angular escapes it, and the API never sends HTML. -->
          <p class="extract">{{ s.data.extract }}</p>
          <a [href]="s.data.wikiUrl" target="_blank" rel="noopener">Read more on Wikipedia</a>
        } @else if (s.status === 'error') {
          <app-load-status what="city description" [error]="s.message" (retry)="retry.emit()" />
        } @else {
          <app-load-status what="city description" />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    h2 {
      margin: 0;
      font: var(--mat-sys-title-large);
    }
    .thumbnail {
      float: right;
      max-width: 40%;
      max-height: 180px;
      margin: 0 0 8px 12px;
      border-radius: 8px;
      object-fit: cover;
    }
    .description {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .extract {
      line-height: 1.6;
    }
    a {
      color: var(--mat-sys-primary);
    }
    @media (max-width: 480px) {
      .thumbnail {
        float: none;
        display: block;
        max-width: 100%;
        margin: 0 0 12px;
      }
    }
  `,
})
export class SummaryCard {
  readonly state = input.required<Loadable<CitySummary>>();
  readonly cityName = input.required<string>();
  readonly retry = output();
}
