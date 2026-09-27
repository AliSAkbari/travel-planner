import type { Request, RequestHandler } from 'express';

// TEMPORARY: used on the first deploys to verify the hosting setup, then
// removed. Answers these questions (docs/ARCHITECTURE.md §9):
//   1. How many proxy hops sit in front of the app? (sets TRUST_PROXY_HOPS)
//   2. Which geolocation providers answer requests from the host's outbound IPs?
//   3. How does the proxy chain differ when the function's own run.app URL
//      is called directly, bypassing Firebase Hosting?
// Only registered when ENABLE_DIAGNOSTICS=true, and still requires a token.

/** Proxy-related headers worth seeing. An allowlist, so e.g. Authorization is never echoed. */
const PROXY_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
  'via',
  'cf-connecting-ip',
  'true-client-ip',
  'fastly-client-ip',
  'x-forwarded-host',
] as const;

/**
 * Keyless geolocation candidates, queried in parallel from production. Keyless
 * quotas are counted per client IP, and here the "client" is a shared Google
 * Cloud egress address, so only a real call from the deployed function shows
 * which providers still answer.
 */
const GEO_PROVIDERS: Record<string, (ip: string) => string> = {
  'ipapi.co': (ip) => `https://ipapi.co/${ip}/json/`,
  'ip-api.com (HTTP only)': (ip) =>
    `http://ip-api.com/json/${ip}?fields=status,message,city,region,countryCode,lat,lon`,
  'ipwho.is': (ip) => `https://ipwho.is/${ip}`,
  'ip2location.io (keyless)': (ip) => `https://api.ip2location.io/?ip=${ip}`,
  'ipinfo.io (no token)': (ip) => `https://ipinfo.io/${ip}/json`,
  'ipapi.is (anonymous)': (ip) => `https://api.ipapi.is/?q=${ip}`,
  'geojs.io': (ip) => `https://get.geojs.io/v1/ip/geo/${ip}.json`,
};

/** Calls one URL and reports what came back, including failures. */
async function probe(url: string) {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return {
      status: response.status,
      durationMs: Date.now() - started,
      body: (await response.text()).slice(0, 400),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Asks every candidate provider about the same IP, in parallel. */
async function probeGeoProviders(ip: string | undefined) {
  if (!ip) return { error: 'req.ip is undefined' };
  const encoded = encodeURIComponent(ip);
  const entries = Object.entries(GEO_PROVIDERS);
  const results = await Promise.all(entries.map(([, toUrl]) => probe(toUrl(encoded))));
  return Object.fromEntries(entries.map(([name], i) => [name, results[i]]));
}

function proxyHeaders(req: Request) {
  return Object.fromEntries(PROXY_HEADERS.map((name) => [name, req.get(name) ?? null]));
}

export function createDiagnosticsController(trustProxyHops: number) {
  /** GET /api/diagnostics/network */
  const network: RequestHandler = async (req, res) => {
    res.json({
      trustProxyHops,
      socketRemoteAddress: req.socket.remoteAddress ?? null,
      reqIp: req.ip ?? null,
      reqIps: req.ips,
      headers: proxyHeaders(req),
      geo: await probeGeoProviders(req.ip),
    });
  };

  return { network };
}
