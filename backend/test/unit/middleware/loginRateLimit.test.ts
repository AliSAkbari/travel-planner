import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/middleware/errorHandler.js';
import { createLoginRateLimiter } from '../../../src/middleware/loginRateLimit.js';

/**
 * A minimal app: the limiter, then a handler that always fails (401) so every
 * request counts. getIp simulates what req.ip resolves to (undefined = unknown).
 */
function appWithIp(getIp: () => string | undefined) {
  const app = express();
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: getIp() });
    next();
  });
  app.post('/login', createLoginRateLimiter(), (_req, res) => {
    res.status(401).end();
  });
  app.use(errorHandler);
  return app;
}

async function failFiveTimes(app: express.Express) {
  for (let i = 0; i < 5; i++) await request(app).post('/login');
}

describe('createLoginRateLimiter', () => {
  it('limits requests with no resolvable IP instead of failing with 500', async () => {
    const app = appWithIp(() => undefined);
    await failFiveTimes(app);

    const res = await request(app).post('/login');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('treats IPv6 addresses in the same /56 as one client', async () => {
    let ip = '2001:db8:0:1::1';
    const app = appWithIp(() => ip);
    await failFiveTimes(app);

    ip = '2001:db8:0:2::99'; // a different /64, but the same /56

    expect((await request(app).post('/login')).status).toBe(429);
  });

  it('keeps separate counters for unrelated IPs', async () => {
    let ip = '203.0.113.1';
    const app = appWithIp(() => ip);
    await failFiveTimes(app);

    ip = '198.51.100.7';

    expect((await request(app).post('/login')).status).toBe(401);
  });
});
