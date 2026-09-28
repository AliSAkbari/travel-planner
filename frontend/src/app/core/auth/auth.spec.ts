import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { epochSeconds, fakeJwt } from '../../../testing/fake-jwt';
import { authGuard, safeReturnUrl } from './auth.guard';
import { AuthService, LOGIN_URL, readClaims } from './auth.service';

const TOKEN_KEY = 'travel-planner.token';

function setUp() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  return { auth: TestBed.inject(AuthService), backend: TestBed.inject(HttpTestingController) };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe('AuthService', () => {
  it('stores the token on login and exposes the username', () => {
    const { auth, backend } = setUp();
    const token = fakeJwt({ sub: 'demo', exp: epochSeconds(3600) });

    auth.login('demo', 'pw').subscribe();
    const req = backend.expectOne(LOGIN_URL);
    expect(req.request.body).toEqual({ username: 'demo', password: 'pw' });
    req.flush({ token, expiresIn: 3600, user: { username: 'demo' } });

    expect(sessionStorage.getItem(TOKEN_KEY)).toBe(token);
    expect(auth.username()).toBe('demo');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('restores the session from sessionStorage (survives a refresh)', () => {
    sessionStorage.setItem(TOKEN_KEY, fakeJwt({ sub: 'demo', exp: epochSeconds(60) }));
    expect(setUp().auth.isAuthenticated()).toBe(true);
  });

  it('treats an expired token as logged out', () => {
    sessionStorage.setItem(TOKEN_KEY, fakeJwt({ sub: 'demo', exp: epochSeconds(-1) }));
    expect(setUp().auth.isAuthenticated()).toBe(false);
  });

  it('treats a malformed token as logged out', () => {
    sessionStorage.setItem(TOKEN_KEY, 'not-a-jwt');
    const { auth } = setUp();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.username()).toBeNull();
  });

  it('clears the token on logout', () => {
    sessionStorage.setItem(TOKEN_KEY, fakeJwt({ sub: 'demo', exp: epochSeconds(60) }));
    const { auth } = setUp();

    auth.logout();

    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(auth.username()).toBeNull();
  });

  it('readClaims decodes base64url payloads', () => {
    // "?>" encodes to characters that differ between base64 and base64url.
    expect(readClaims(fakeJwt({ sub: '?>?>' }))?.sub).toBe('?>?>');
  });
});

describe('authGuard', () => {
  const run = (url: string) =>
    TestBed.runInInjectionContext(() => authGuard({} as never, { url } as never));

  it('lets an authenticated user through', () => {
    sessionStorage.setItem(TOKEN_KEY, fakeJwt({ sub: 'demo', exp: epochSeconds(60) }));
    setUp();
    expect(run('/')).toBe(true);
  });

  it('redirects to /login with the attempted URL', () => {
    setUp();
    const result = run('/') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2F');
  });
});

describe('safeReturnUrl', () => {
  it.each([
    ['/', '/'],
    ['/login', '/login'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnUrl(input)).toBe(expected);
  });
});
