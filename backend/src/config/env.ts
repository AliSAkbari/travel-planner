import { z } from 'zod';

/**
 * Schema for the environment variables the backend reads.
 * Every value in process.env is a string, so numbers and booleans are converted here.
 * Only variables the code actually uses belong in this schema.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // coerce turns "" into 0, which min(1) rejects: an empty PORT is an error, not port 0.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Number of reverse proxies in front of the app (Express 'trust proxy').
  // 0 = trust none, so req.ip is the direct TCP peer. See docs/ARCHITECTURE.md §5.3.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  // HS256 signing key. 32+ characters so it can't be brute-forced offline from a stolen token.
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),

  DEMO_USERNAME: z.string().trim().min(1).max(100),
  // Must look like a bcrypt hash ($2a$/$2b$/$2y$, 2-digit cost, 53 chars of salt+hash),
  // so pasting the plaintext password here by mistake fails at startup.
  DEMO_PASSWORD_HASH: z
    .string()
    .regex(
      /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
      'must be a bcrypt hash (run: npm run hash-password)',
    ),

  // Not z.coerce.boolean(): that would turn the string "false" into true.
  ENABLE_DIAGNOSTICS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/** Validated, typed application configuration. */
export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly trustProxyHops: number;
  readonly jwt: { readonly secret: string; readonly expiresInSeconds: number };
  readonly demoUser: { readonly username: string; readonly passwordHash: string };
  /** Temporary: exposes GET /api/diagnostics/network for verifying the hosting setup. */
  readonly enableDiagnostics: boolean;
}

/**
 * Validates the given environment and returns a typed Config.
 * Takes `env` as a parameter (instead of reading process.env directly) so tests
 * can pass any environment without mutating global state.
 *
 * @throws Error listing every invalid variable, so a misconfigured deploy
 *   fails at startup with a readable message rather than at request time.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    trustProxyHops: e.TRUST_PROXY_HOPS,
    jwt: { secret: e.JWT_SECRET, expiresInSeconds: e.JWT_EXPIRES_IN_SECONDS },
    demoUser: { username: e.DEMO_USERNAME, passwordHash: e.DEMO_PASSWORD_HASH },
    enableDiagnostics: e.ENABLE_DIAGNOSTICS,
  };
}
