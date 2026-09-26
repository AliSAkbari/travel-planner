import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/env.js';

// A syntactically valid bcrypt hash (never checked against a password in these tests).
const HASH = '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

/** The variables that have no defaults. */
const required = {
  JWT_SECRET: 'x'.repeat(32),
  DEMO_USERNAME: 'demo',
  DEMO_PASSWORD_HASH: HASH,
};

describe('loadConfig', () => {
  it('applies defaults to optional variables', () => {
    expect(loadConfig(required)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      trustProxyHops: 0,
      jwt: { secret: 'x'.repeat(32), expiresInSeconds: 3600 },
      demoUser: { username: 'demo', passwordHash: HASH },
      enableDiagnostics: false,
    });
  });

  it('coerces string values from the environment', () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: 'production',
      PORT: '8080',
      TRUST_PROXY_HOPS: '1',
      JWT_EXPIRES_IN_SECONDS: '900',
      ENABLE_DIAGNOSTICS: 'true',
    });
    expect(config).toMatchObject({
      nodeEnv: 'production',
      port: 8080,
      trustProxyHops: 1,
      jwt: { expiresInSeconds: 900 },
      enableDiagnostics: true,
    });
  });

  it('ignores unrelated variables', () => {
    expect(loadConfig({ ...required, PATH: '/usr/bin' }).port).toBe(3000);
  });

  it('rejects a non-numeric PORT and names the variable', () => {
    expect(() => loadConfig({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an empty PORT instead of treating it as 0', () => {
    expect(() => loadConfig({ ...required, PORT: '' })).toThrow(/PORT/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadConfig({ ...required, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ ...required, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a negative or fractional TRUST_PROXY_HOPS', () => {
    expect(() => loadConfig({ ...required, TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadConfig({ ...required, TRUST_PROXY_HOPS: '1.5' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('requires JWT_SECRET, DEMO_USERNAME and DEMO_PASSWORD_HASH', () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET[\s\S]*DEMO_USERNAME[\s\S]*DEMO_PASSWORD_HASH/);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ ...required, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a DEMO_PASSWORD_HASH that is not a bcrypt hash', () => {
    expect(() => loadConfig({ ...required, DEMO_PASSWORD_HASH: 'hunter2' })).toThrow(
      /DEMO_PASSWORD_HASH/,
    );
  });

  it('treats ENABLE_DIAGNOSTICS="false" as false and rejects other strings', () => {
    expect(loadConfig({ ...required, ENABLE_DIAGNOSTICS: 'false' }).enableDiagnostics).toBe(false);
    expect(() => loadConfig({ ...required, ENABLE_DIAGNOSTICS: 'yes' })).toThrow(
      /ENABLE_DIAGNOSTICS/,
    );
  });

  it('reports every invalid variable in one error', () => {
    expect(() => loadConfig({ ...required, PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV[\s\S]*PORT|PORT[\s\S]*NODE_ENV/,
    );
  });
});
