import { BlockList, isIP } from 'node:net';

// Addresses a geolocation service can't place: loopback, private networks,
// link-local, carrier-grade NAT and "unspecified". Node's BlockList does the
// subnet matching for both IPv4 and IPv6.
const nonPublic = new BlockList();
nonPublic.addSubnet('0.0.0.0', 8, 'ipv4');
nonPublic.addSubnet('10.0.0.0', 8, 'ipv4');
nonPublic.addSubnet('100.64.0.0', 10, 'ipv4'); // carrier-grade NAT
nonPublic.addSubnet('127.0.0.0', 8, 'ipv4');
nonPublic.addSubnet('169.254.0.0', 16, 'ipv4');
nonPublic.addSubnet('172.16.0.0', 12, 'ipv4');
nonPublic.addSubnet('192.168.0.0', 16, 'ipv4');
nonPublic.addAddress('::', 'ipv6');
nonPublic.addAddress('::1', 'ipv6');
nonPublic.addSubnet('fc00::', 7, 'ipv6'); // unique local
nonPublic.addSubnet('fe80::', 10, 'ipv6'); // link-local

/**
 * Strips the "::ffff:" prefix Node uses for IPv4 clients on a dual-stack
 * socket, so "::ffff:127.0.0.1" is treated as the IPv4 address it is.
 */
export function normalizeIp(ip: string): string {
  return ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** True for anything that is not a valid, publicly routable IP address. */
export function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return false;
  return !nonPublic.check(ip, version === 4 ? 'ipv4' : 'ipv6');
}
