import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { epochSeconds, fakeJwt } from '../../../testing/fake-jwt';
import { authInterceptor } from './auth.interceptor';
import { AuthService, LOGIN_URL } from './auth.service';

describe('authInterceptor', () => {
  const token = fakeJwt({ sub: 'demo', exp: epochSeconds(3600) });
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: { token: () => string | null; logout: ReturnType<typeof vi.fn> };
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = { token: () => token, logout: vi.fn() };
    router = { url: '/', navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  it('adds the bearer token to API calls', () => {
    http.get('/api/cities').subscribe();
    const req = backend.expectOne('/api/cities');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush([]);
  });

  it('does not send the token anywhere else (e.g. the icon files)', () => {
    http.get('icons/sunny.svg', { responseType: 'text' }).subscribe();
    const req = backend.expectOne('icons/sunny.svg');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('<svg/>');
  });

  it('sends no Authorization header when logged out', () => {
    auth.token = () => null;
    http.get('/api/cities').subscribe();
    const req = backend.expectOne('/api/cities');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('on a 401 from a data endpoint, logs out and redirects to login with a return URL', () => {
    router.url = '/';
    const errorSpy = vi.fn();
    http.get('/api/cities/calgary/weather').subscribe({ error: errorSpy });

    backend
      .expectOne('/api/cities/calgary/weather')
      .flush({ error: { code: 'TOKEN_EXPIRED' } }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/', expired: 1 },
    });
    expect(errorSpy).toHaveBeenCalled(); // the error still reaches the caller
  });

  it('on a 401 from the login endpoint, does NOT log out or redirect: it just means wrong credentials', () => {
    const errorSpy = vi.fn();
    http.post(LOGIN_URL, { username: 'demo', password: 'wrong' }).subscribe({ error: errorSpy });

    backend
      .expectOne(LOGIN_URL)
      .flush(
        { error: { code: 'INVALID_CREDENTIALS' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('leaves other errors to the caller', () => {
    http.get('/api/cities').subscribe({ error: () => undefined });
    backend.expectOne('/api/cities').flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
