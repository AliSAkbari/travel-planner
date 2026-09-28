import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protects pages that need a session. This is for user experience only (no
 * flash of a page that can't load): the server enforces auth on every request.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;

  auth.logout(); // clears an expired token, if any
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Sends an already logged-in user away from the login page. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;

/**
 * Only allows same-app paths as a post-login redirect. Without this check,
 * /login?returnUrl=https://evil.example would be an open redirect.
 * "//evil.example" and "/\evil.example" are also rejected: browsers treat
 * them as links to another site.
 */
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}
