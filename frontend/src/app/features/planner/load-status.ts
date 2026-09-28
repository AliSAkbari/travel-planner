import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** The loading and error states every card shares. */
@Component({
  selector: 'app-load-status',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (error(); as message) {
      <div class="error" role="alert">
        <mat-icon svgIcon="error" aria-hidden="true" />
        <p>{{ message }}</p>
        <button mat-stroked-button type="button" (click)="retry.emit()">
          <mat-icon svgIcon="refresh" aria-hidden="true" />
          Try again
        </button>
      </div>
    } @else {
      <div class="loading" role="status">
        <mat-spinner diameter="32" aria-hidden="true" />
        <span class="visually-hidden">Loading {{ what() }}…</span>
      </div>
    }
  `,
  styles: `
    .loading,
    .error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px 8px;
      text-align: center;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .error p {
      margin: 0;
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class LoadStatus {
  /** What is loading, for the screen-reader announcement. */
  readonly what = input.required<string>();
  /** Set when the request failed; otherwise the spinner shows. */
  readonly error = input<string | null>(null);
  readonly retry = output();
}
