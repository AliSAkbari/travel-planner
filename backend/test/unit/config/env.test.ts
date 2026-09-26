import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/env.js';

describe('loadConfig', () => {
  it('applies defaults when variables are unset', () => {
    expect(loadConfig({})).toEqual({ nodeEnv: 'development', port: 3000, trustProxyHops: 0 });
  });

  it('coerces string values from the environment', () => {
    const config = loadConfig({ NODE_ENV: 'production', PORT: '8080', TRUST_PROXY_HOPS: '1' });
    expect(config).toEqual({ nodeEnv: 'production', port: 8080, trustProxyHops: 1 });
  });

  it('ignores unrelated variables', () => {
    expect(loadConfig({ PATH: '/usr/bin', HOME: '/home/app' }).port).toBe(3000);
  });

  it('rejects a non-numeric PORT and names the variable', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an empty PORT instead of treating it as 0', () => {
    expect(() => loadConfig({ PORT: '' })).toThrow(/PORT/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a negative or fractional TRUST_PROXY_HOPS', () => {
    expect(() => loadConfig({ TRUST_PROXY_HOPS: '-1' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => loadConfig({ TRUST_PROXY_HOPS: '1.5' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() => loadConfig({ PORT: 'abc', NODE_ENV: 'staging' })).toThrow(
      /PORT[\s\S]*NODE_ENV|NODE_ENV[\s\S]*PORT/,
    );
  });
});
