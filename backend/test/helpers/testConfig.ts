import bcrypt from 'bcryptjs';
import type { Config } from '../../src/config/env.js';

export const TEST_USERNAME = 'demo';
export const TEST_PASSWORD = 'correct-horse-battery-staple';

// Cost 4 is bcrypt's minimum: keeps tests fast. Production hashes use cost 12.
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

/** A complete, valid Config for tests; pass overrides for the fields a test cares about. */
export function makeTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    port: 0,
    trustProxyHops: 0,
    jwt: { secret: 'test-secret-that-is-at-least-32-chars!', expiresInSeconds: 3600 },
    demoUser: { username: TEST_USERNAME, passwordHash: TEST_PASSWORD_HASH },
    enableDiagnostics: false,
    ...overrides,
  };
}
