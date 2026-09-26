import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../../../src/services/auth.service.js';
import { HttpError } from '../../../src/utils/httpError.js';
import { makeTestConfig, TEST_PASSWORD, TEST_USERNAME } from '../../helpers/testConfig.js';

const config = makeTestConfig();
const auth = createAuthService(config);
const secret = config.jwt.secret;

/** Runs fn and returns the HttpError it throws (fails the test if it doesn't). */
function catchHttpError(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw err;
  }
  throw new Error('Expected an HttpError to be thrown');
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

afterEach(() => {
  vi.useRealTimers();
});

describe('login', () => {
  it('returns a token, its lifetime and the user for valid credentials', async () => {
    const result = await auth.login(TEST_USERNAME, TEST_PASSWORD);

    expect(result.expiresIn).toBe(3600);
    expect(result.user).toEqual({ username: TEST_USERNAME });

    const payload = jwt.verify(result.token, secret) as jwt.JwtPayload;
    expect(payload.sub).toBe(TEST_USERNAME);
    expect(payload.exp! - payload.iat!).toBe(3600);
  });

  it('signs with HS256', async () => {
    const { token } = await auth.login(TEST_USERNAME, TEST_PASSWORD);
    expect(jwt.decode(token, { complete: true })?.header.alg).toBe('HS256');
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    await expect(auth.login(TEST_USERNAME, 'wrong')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects an unknown username with the same error', async () => {
    await expect(auth.login('someone-else', TEST_PASSWORD)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    });
  });

  it('still runs bcrypt for an unknown username, against a hash of the same cost', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');

    await expect(auth.login('someone-else', TEST_PASSWORD)).rejects.toThrow();

    expect(compare).toHaveBeenCalledOnce();
    const hashUsed = compare.mock.calls[0]![1];
    expect(hashUsed).not.toBe(config.demoUser.passwordHash);
    expect(bcrypt.getRounds(hashUsed)).toBe(bcrypt.getRounds(config.demoUser.passwordHash));
  });
});

describe('verifyToken', () => {
  it('returns the user for a token it issued', async () => {
    const { token } = await auth.login(TEST_USERNAME, TEST_PASSWORD);
    expect(auth.verifyToken(token)).toEqual({ username: TEST_USERNAME });
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    vi.useFakeTimers();
    const { token } = await auth.login(TEST_USERNAME, TEST_PASSWORD);

    vi.advanceTimersByTime(3601 * 1000);

    expect(catchHttpError(() => auth.verifyToken(token))).toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('rejects a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: TEST_USERNAME }, 'a-different-secret-of-32-characters!!');
    expect(catchHttpError(() => auth.verifyToken(forged)).code).toBe('INVALID_TOKEN');
  });

  it('rejects an unsigned alg:none token', () => {
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: TEST_USERNAME })}.`;
    expect(catchHttpError(() => auth.verifyToken(unsigned)).code).toBe('INVALID_TOKEN');
  });

  it('rejects a correctly signed token that uses a different algorithm', () => {
    const hs512 = jwt.sign({ sub: TEST_USERNAME }, secret, { algorithm: 'HS512' });
    expect(catchHttpError(() => auth.verifyToken(hs512)).code).toBe('INVALID_TOKEN');
  });

  it('rejects malformed tokens', () => {
    expect(catchHttpError(() => auth.verifyToken('not-a-jwt')).code).toBe('INVALID_TOKEN');
    expect(catchHttpError(() => auth.verifyToken('')).code).toBe('INVALID_TOKEN');
  });

  it('rejects a signed token without a sub claim', () => {
    const noSub = jwt.sign({ role: 'admin' }, secret);
    expect(catchHttpError(() => auth.verifyToken(noSub)).code).toBe('INVALID_TOKEN');
  });

  it('rejects a signed token for a different user', () => {
    const otherUser = jwt.sign({ sub: 'someone-else' }, secret);
    expect(catchHttpError(() => auth.verifyToken(otherUser)).code).toBe('INVALID_TOKEN');
  });

  it('rejects a signed token whose payload is a plain string', () => {
    const stringPayload = jwt.sign('just-a-string', secret);
    expect(catchHttpError(() => auth.verifyToken(stringPayload)).code).toBe('INVALID_TOKEN');
  });
});
