import type { Request, RequestHandler } from 'express';

// TEMPORARY: used once on the first deploy to verify the hosting setup, then
// removed. Answers these questions (docs/ARCHITECTURE.md §9):
//   1. How many proxy hops sit in front of the app? (sets TRUST_PROXY_HOPS)
//   2. Does ipapi.co answer requests from the host's outbound IPs?
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

/** Calls ipapi.co for the given IP and reports what came back, including failures. */
async function probeIpapi(ip: string | undefined) {
  if (!ip) return { error: 'req.ip is undefined' };
  const started = Date.now();
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      durationMs: Date.now() - started,
      body: (await response.text()).slice(0, 1000),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
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
      ipapi: await probeIpapi(req.ip),
    });
  };

  return { network };
}
