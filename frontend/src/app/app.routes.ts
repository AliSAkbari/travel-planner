import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Log in · Travel Planner',
    // Lazy-loaded: each page's code is only downloaded when first visited.
    loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    title: 'Travel Planner',
    loadComponent: () => import('./features/planner/planner.page').then((m) => m.PlannerPage),
  },
  { path: '**', redirectTo: '' },
];
