import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService, LOGIN_URL } from './auth.service';

/**
 * Adds the bearer token to our own API calls, and ends the session when the
 * API says the token is no longer valid.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Only our API gets the token: never other origins, and not static files
  // such as the icon SVGs, which are fetched through HttpClient too.
  const isApiCall = req.url.startsWith('/api/');
  const token = auth.token();
  const request =
    isApiCall && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      // A 401 from a data endpoint means the session is over (expired or invalid
      // token): clear it and send the user to log in, then back here.
      // A 401 from the login endpoint just means wrong credentials: there is no
      // session to end, so it is passed through for the login page to display.
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isApiCall &&
        req.url !== LOGIN_URL
      ) {
        auth.logout();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url, expired: 1 },
        });
      }
      return throwError(() => error);
    }),
  );
};
