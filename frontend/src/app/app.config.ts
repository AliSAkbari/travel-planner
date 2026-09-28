import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { registerIcons } from './core/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: query params (e.g. ?returnUrl=) arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    // Functional interceptor: attaches the token and handles expired sessions.
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(registerIcons),
  ],
};
