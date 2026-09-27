import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { makeTestConfig, TEST_PASSWORD, TEST_USERNAME } from '../helpers/testConfig.js';

const config = makeTestConfig();

// A fresh app per test: the login rate limiter's counters live inside the app,
// so failed logins in one test can't cause 429s in another.
let app: Express;
beforeEach(() => {
  app = createApp(config);
});

const login = (username: string, password: string) =>
  request(app).post('/api/auth/login').send({ username, password });

async function validToken(): Promise<string> {
  const res = await login(TEST_USERNAME, TEST_PASSWORD);
  return res.body.token as string;
}

describe('POST /api/auth/login', () => {
  it('returns 200 with a token, its lifetime and the user', async () => {
    const res = await login(TEST_USERNAME, TEST_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: expect.any(String),
      expiresIn: 3600,
      user: { username: TEST_USERNAME },
    });
  });

  it('returns 401 INVALID_CREDENTIALS with WWW-Authenticate for a wrong password', async () => {
    const res = await login(TEST_USERNAME, 'wrong-password');

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
    });
  });

  it('returns the identical response for an unknown username', async () => {
    const wrongPassword = await login(TEST_USERNAME, 'wrong-password');
    const unknownUser = await login('nobody', TEST_PASSWORD);

    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it('returns 400 VALIDATION_ERROR naming the missing field', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: TEST_USERNAME });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ path: 'password', message: expect.any(String) }]);
  });

  it('returns 400 when there is no JSON body', async () => {
    const res = await request(app).post('/api/auth/login');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a password over 72 bytes even if it is under 72 characters', async () => {
    const res = await login(TEST_USERNAME, 'é'.repeat(40)); // 40 chars, 80 bytes

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: 'password', message: 'must be at most 72 bytes' },
    ]);
  });

  it('returns 429 RATE_LIMITED after 5 failed attempts, even with correct credentials', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login(TEST_USERNAME, 'wrong')).status).toBe(401);
    }

    const res = await login(TEST_USERNAME, TEST_PASSWORD);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('does not count successful logins towards the limit', async () => {
    for (let i = 0; i < 6; i++) {
      expect((await login(TEST_USERNAME, TEST_PASSWORD)).status).toBe(200);
    }
  });

  it('sends standard RateLimit headers', async () => {
    const res = await login(TEST_USERNAME, 'wrong');
    expect(res.headers['ratelimit-policy']).toBeDefined();
    expect(res.headers['ratelimit']).toBeDefined();
  });
});

describe('GET /api/auth/me (protected)', () => {
  it('returns 401 MISSING_TOKEN with WWW-Authenticate when there is no token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body.error.code).toBe('MISSING_TOKEN');
  });

  it('returns 401 INVALID_TOKEN for a tampered token', async () => {
    const token = await validToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token.slice(0, -2)}xx`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 TOKEN_EXPIRED for an expired token', async () => {
    const expired = jwt.sign({}, config.jwt.secret, { subject: TEST_USERNAME, expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 200 with the user for a valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${await validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: TEST_USERNAME });
  });
});

describe('unknown /api routes', () => {
  it('return 401 without a token, so route existence is not revealed', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(401);
  });

  it('return a JSON 404 in the standard shape with a valid token', async () => {
    const res = await request(app)
      .get('/api/does-not-exist')
      .set('Authorization', `Bearer ${await validToken()}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
});

// Header shapes measured on the deployed app. Behind Firebase Hosting, the socket
// peer is Google's front end and X-Forwarded-For is "<client>, <Hosting CDN>",
// so production runs with TRUST_PROXY_HOPS=2. Here supertest's socket plays the
// front end; the IPs are documentation addresses.
describe('login rate limit behind two trusted proxies', () => {
  const CLIENT = '203.0.113.9';
  const CDN = '198.51.100.1';

  async function failedLoginFrom(proxyApp: Express, xForwardedFor: string) {
    return request(proxyApp)
      .post('/api/auth/login')
      .set('X-Forwarded-For', xForwardedFor)
      .send({ username: TEST_USERNAME, password: 'wrong' });
  }

  it('cannot be dodged by prepending fake X-Forwarded-For entries', async () => {
    const proxyApp = createApp(makeTestConfig({ trustProxyHops: 2 }));

    // A different forged entry each time; the real client address stays the same.
    for (let i = 1; i <= 5; i++) {
      await failedLoginFrom(proxyApp, `6.6.6.${i}, ${CLIENT}, ${CDN}`);
    }

    expect((await failedLoginFrom(proxyApp, `6.6.6.99, ${CLIENT}, ${CDN}`)).status).toBe(429);
  });

  it('documents the direct run.app bypass: one hop fewer lets the forged entry become req.ip', async () => {
    const proxyApp = createApp(makeTestConfig({ trustProxyHops: 2 }));

    // Calling the function URL directly skips the Hosting CDN, so the chain is one
    // entry shorter and the second-from-right entry is attacker-controlled.
    for (let i = 1; i <= 5; i++) {
      await failedLoginFrom(proxyApp, `6.6.6.${i}, ${CLIENT}`);
    }

    // Each attempt looked like a new client, so the limit never triggers.
    expect((await failedLoginFrom(proxyApp, `6.6.6.99, ${CLIENT}`)).status).toBe(401);
  });
});
