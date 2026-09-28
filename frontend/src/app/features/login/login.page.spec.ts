import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { epochSeconds, fakeJwt } from '../../../testing/fake-jwt';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { LOGIN_URL } from '../../core/auth/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let backend: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      // The real interceptor is included on purpose: a wrong password must stay on
      // this page with a message, not trigger the "session expired" redirect.
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate');
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  async function submit(returnUrl?: string) {
    const fixture = TestBed.createComponent(LoginPage);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    type('input[autocomplete="username"]', 'demo');
    type('input[autocomplete="current-password"]', 'secret');
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    return { fixture, el };
  }

  it('shows "Invalid username or password." on a 401 and stays on the page', async () => {
    const { fixture, el } = await submit();

    backend
      .expectOne(LOGIN_URL)
      .flush(
        { error: { code: 'INVALID_CREDENTIALS' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Invalid username or password.',
    );
    expect(router.navigate).not.toHaveBeenCalled(); // no "session expired" redirect
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('explains rate limiting on a 429', async () => {
    const { fixture, el } = await submit();
    backend.expectOne(LOGIN_URL).flush(null, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Too many failed attempts');
  });

  it('goes to the return URL after logging in, but never to another site', async () => {
    await submit('https://evil.example');
    backend.expectOne(LOGIN_URL).flush({
      token: fakeJwt({ sub: 'demo', exp: epochSeconds(3600) }),
      expiresIn: 3600,
      user: { username: 'demo' },
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('keeps the labels floated from the start, so autofilled values never overlap them', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const labels = (fixture.nativeElement as HTMLElement).querySelectorAll('.mdc-floating-label');
    expect(labels).toHaveLength(2);
    labels.forEach((label) => expect(label.classList).toContain('mdc-floating-label--float-above'));
  });

  it('submits values a password manager filled in without firing input events', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // Set .value directly, with no events: the form itself never hears about it.
    el.querySelector<HTMLInputElement>('input[autocomplete="username"]')!.value = 'demo';
    el.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!.value = 'secret';

    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    expect(backend.expectOne(LOGIN_URL).request.body).toEqual({
      username: 'demo',
      password: 'secret',
    });
  });

  it('turns off auto-capitalisation and autocorrect on the username field', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      'input[autocomplete="username"]',
    )!;
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  it('does not submit an empty form', () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[type="submit"]')!
      .click();
    backend.expectNone(LOGIN_URL);
  });
});
