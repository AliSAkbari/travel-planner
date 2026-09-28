import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, type Observable, tap } from 'rxjs';
import type { LoginResponse } from '../api/api.models';

export const LOGIN_URL = '/api/auth/login';
const TOKEN_KEY = 'travel-planner.token';

interface TokenClaims {
  sub?: string;
  /** Expiry, in seconds since the epoch. */
  exp?: number;
}

/**
 * Reads a JWT's payload without verifying it. That is fine here: the server
 * verifies every request. The client only uses the claims for display
 * (username) and to skip a request it knows would fail (expired token).
 */
export function readClaims(token: string): TokenClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // base64url -> base64, then decode.
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

/**
 * Holds the session. The token lives in sessionStorage: it survives a page
 * refresh but is cleared when the tab closes (trade-offs in docs/ARCHITECTURE.md §5.4).
 * A signal holds the current token, so the toolbar and guards react to login/logout.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenState = signal<string | null>(readStoredToken());

  /** The raw token, for the interceptor. */
  readonly token = this.tokenState.asReadonly();

  /** The logged-in username, from the token's `sub` claim. */
  readonly username = computed(() => {
    const token = this.tokenState();
    return token ? (readClaims(token)?.sub ?? null) : null;
  });

  /**
   * True if there is a token that hasn't expired yet. A method, not a computed
   * signal: the answer changes with the clock, not only with the token.
   */
  isAuthenticated(): boolean {
    const token = this.tokenState();
    const exp = token ? readClaims(token)?.exp : undefined;
    return exp !== undefined && exp * 1000 > Date.now();
  }

  /** Logs in and stores the token. Errors (401, 429, network) are left to the caller to display. */
  login(username: string, password: string): Observable<void> {
    return this.http.post<LoginResponse>(LOGIN_URL, { username, password }).pipe(
      tap(({ token }) => this.setToken(token)),
      map(() => undefined),
    );
  }

  logout(): void {
    this.setToken(null);
  }

  private setToken(token: string | null): void {
    this.tokenState.set(token);
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage can be unavailable (e.g. some private modes). The session then
      // lasts until a refresh, which is acceptable.
    }
  }
}

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
