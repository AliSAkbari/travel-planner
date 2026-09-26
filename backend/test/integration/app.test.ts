import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { makeTestConfig } from '../helpers/testConfig.js';

const app = createApp(makeTestConfig());

describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets helmet security headers and hides X-Powered-By', async () => {
    const res = await request(app).get('/healthz');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).not.toBe(401);
  });
});

// Unknown-route (401/404) behaviour is covered in auth.test.ts, since it depends on the token.
describe('request body errors', () => {
  it('returns 400 INVALID_JSON for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for a body over 10kb', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(11 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
