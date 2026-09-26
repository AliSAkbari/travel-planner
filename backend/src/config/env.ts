import { z } from 'zod';

/**
 * Schema for the environment variables the backend reads.
 * Every value in process.env is a string, so numbers are coerced here.
 * Only variables the code actually uses belong in this schema.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // coerce turns "" into 0, which min(1) rejects: an empty PORT is an error, not port 0.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Number of reverse proxies in front of the app (Express 'trust proxy').
  // 0 = trust none, so req.ip is the direct TCP peer. See docs/ARCHITECTURE.md §5.3.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

/** Validated, typed application configuration. */
export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly trustProxyHops: number;
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

  const { NODE_ENV, PORT, TRUST_PROXY_HOPS } = result.data;
  return { nodeEnv: NODE_ENV, port: PORT, trustProxyHops: TRUST_PROXY_HOPS };
}
