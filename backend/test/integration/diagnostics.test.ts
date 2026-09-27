import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { makeTestConfig, TEST_PASSWORD, TEST_USERNAME } from '../helpers/testConfig.js';

async function appWithToken(overrides: Partial<Config>) {
  const app = createApp(makeTestConfig(overrides));
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  return { app, auth: `Bearer ${res.body.token as string}` };
}

/** Every provider call gets the same answer. A fresh Response per call: a body can only be read once. */
function mockGeo(body: object, status = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

describe('GET /api/diagnostics/network', () => {
  it('is not registered when diagnostics are disabled', async () => {
    const { app, auth } = await appWithToken({ enableDiagnostics: false });
    const res = await request(app).get('/api/diagnostics/network').set('Authorization', auth);
    expect(res.status).toBe(404);
  });

  it('requires a token when enabled', async () => {
    const { app } = await appWithToken({ enableDiagnostics: true });
    const res = await request(app).get('/api/diagnostics/network');
    expect(res.status).toBe(401);
  });

  it('with 0 trusted hops, ignores X-Forwarded-For and uses the socket address', async () => {
    mockGeo({ city: 'Somewhere' });
    const { app, auth } = await appWithToken({ enableDiagnostics: true, trustProxyHops: 0 });

    const res = await request(app)
      .get('/api/diagnostics/network')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '203.0.113.9');

    expect(res.body.headers['x-forwarded-for']).toBe('203.0.113.9');
    expect(res.body.reqIp).toBe(res.body.socketRemoteAddress);
  });

  it('with 1 trusted hop, takes the rightmost X-Forwarded-For entry (client-written entries on the left are ignored)', async () => {
    mockGeo({ city: 'Calgary' });
    const { app, auth } = await appWithToken({ enableDiagnostics: true, trustProxyHops: 1 });

    // "6.6.6.6" is what a spoofing client wrote; "203.0.113.9" is what our proxy appended.
    const res = await request(app)
      .get('/api/diagnostics/network')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.9');

    expect(res.body.reqIp).toBe('203.0.113.9');
  });

  it('asks every candidate provider about req.ip and reports each result', async () => {
    const fetchSpy = mockGeo({ city: 'Calgary' });
    const { app, auth } = await appWithToken({ enableDiagnostics: true, trustProxyHops: 1 });

    const res = await request(app)
      .get('/api/diagnostics/network')
      .set('Authorization', auth)
      .set('X-Forwarded-For', '203.0.113.9');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://ipapi.co/203.0.113.9/json/',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchSpy).toHaveBeenCalledWith('https://ipwho.is/203.0.113.9', expect.anything());
    expect(Object.keys(res.body.geo)).toHaveLength(fetchSpy.mock.calls.length);
    expect(res.body.geo['ipwho.is']).toMatchObject({ status: 200, durationMs: expect.any(Number) });
    expect(JSON.parse(res.body.geo['ipwho.is'].body)).toEqual({ city: 'Calgary' });
  });

  it('reports provider rate limiting instead of failing', async () => {
    mockGeo({ error: true, reason: 'RateLimited' }, 429);
    const { app, auth } = await appWithToken({ enableDiagnostics: true });

    const res = await request(app).get('/api/diagnostics/network').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.geo['ipapi.co'].status).toBe(429);
  });

  it('reports network errors instead of failing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const { app, auth } = await appWithToken({ enableDiagnostics: true });

    const res = await request(app).get('/api/diagnostics/network').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.geo['ipapi.co']).toEqual({ error: 'getaddrinfo ENOTFOUND' });
  });

  it('does not echo non-proxy headers such as Authorization', async () => {
    mockGeo({});
    const { app, auth } = await appWithToken({ enableDiagnostics: true });

    const res = await request(app).get('/api/diagnostics/network').set('Authorization', auth);

    expect(JSON.stringify(res.body)).not.toContain(auth.slice(7));
  });
});
