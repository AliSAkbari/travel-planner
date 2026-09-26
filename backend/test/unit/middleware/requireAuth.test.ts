import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { getAuthUser, requireAuth } from '../../../src/middleware/requireAuth.js';
import type { AuthService } from '../../../src/services/auth.service.js';
import { HttpError } from '../../../src/utils/httpError.js';

/** A fake AuthService: only the token "good" is valid. */
const authService: AuthService = {
  login: vi.fn(),
  verifyToken: (token) => {
    if (token === 'good') return { username: 'demo' };
    throw new HttpError(401, 'INVALID_TOKEN', 'Token is invalid');
  },
};
const middleware = requireAuth(authService);

function run(authorization?: string) {
  const req = { get: () => authorization } as unknown as Request;
  const res = { locals: {} } as Response;
  const next = vi.fn();
  middleware(req, res, next);
  return { res, next };
}

describe('requireAuth', () => {
  it('stores the user and calls next for a valid bearer token', () => {
    const { res, next } = run('Bearer good');

    expect(res.locals.user).toEqual({ username: 'demo' });
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts the scheme name in any case', () => {
    expect(run('bearer good').res.locals.user).toEqual({ username: 'demo' });
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['a different scheme', 'Basic ZGVtbzpwYXNz'],
    ['the scheme without a token', 'Bearer '],
    ['a token with spaces', 'Bearer good extra'],
  ])('throws MISSING_TOKEN for %s', (_label, header) => {
    expect(() => run(header)).toThrow(
      expect.objectContaining({ status: 401, code: 'MISSING_TOKEN' }),
    );
  });

  it('propagates the error from verifyToken for an invalid token', () => {
    expect(() => run('Bearer bad')).toThrow(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });
});

describe('getAuthUser', () => {
  it('returns the user set by requireAuth', () => {
    const res = { locals: { user: { username: 'demo' } } } as unknown as Response;
    expect(getAuthUser(res)).toEqual({ username: 'demo' });
  });

  it('throws if the route is not behind requireAuth', () => {
    expect(() => getAuthUser({ locals: {} } as Response)).toThrow(/requireAuth/);
  });
});
