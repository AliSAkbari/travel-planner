/**
 * Builds an unsigned JWT-shaped string for tests. The frontend never verifies
 * signatures (the server does), so only the payload matters here.
 */
export function fakeJwt(claims: { sub?: string; exp?: number }): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

/** Seconds since the epoch, `offsetSeconds` from now. */
export const epochSeconds = (offsetSeconds: number) =>
  Math.floor(Date.now() / 1000) + offsetSeconds;
