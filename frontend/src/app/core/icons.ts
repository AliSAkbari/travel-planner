import { inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * The Material Symbols SVGs the app uses. The build copies exactly these from
 * @material-symbols/svg-400 into /icons (angular.json), instead of shipping the
 * 4 MB icon font. Keep this list and the angular.json glob in sync.
 */
const ICON_NAMES = [
  'sunny',
  'partly_cloudy_day',
  'cloud',
  'foggy',
  'rainy_light',
  'rainy',
  'weather_snowy',
  'thunderstorm',
  'help',
  'logout',
  'location_on',
  'water_drop',
  'air',
  'error',
  'refresh',
  'travel_explore',
] as const;

/** Registers the icons so templates can use <mat-icon svgIcon="sunny" />. */
export function registerIcons(): void {
  const registry = inject(MatIconRegistry);
  const sanitizer = inject(DomSanitizer);
  for (const name of ICON_NAMES) {
    // Angular requires resource URLs to be explicitly marked as trusted. Safe
    // here: each URL is a constant path to our own static file, never user input.
    registry.addSvgIcon(name, sanitizer.bypassSecurityTrustResourceUrl(`icons/${name}.svg`));
  }
}
