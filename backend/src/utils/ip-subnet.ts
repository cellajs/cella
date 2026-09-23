import { isIPv4, isIPv6 } from 'node:net';

/**
 * Privacy-preserving subnet: IPv4 to /24, IPv6 to /48, `null` for invalid input. The canonical output
 * string is what `hashSubnet()` expects.
 */
export const toSubnet = (ip: string): string | null => {
  if (!ip) return null;
  // Strip IPv4-mapped IPv6 prefix so 192.168.0.1 and ::ffff:192.168.0.1 collapse.
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(normalized)) {
    const parts = normalized.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (isIPv6(normalized)) {
    const groups = expandIPv6(normalized);
    if (!groups) return null;
    return `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
  }
  return null;
};

/** Stable rate-limit buckets: IPv4 stays per host, IPv6 collapses to /64 so address rotation cannot evade it. */
export const toRateLimitIp = (ip: string): string => {
  if (!ip) return ip;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(normalized)) return normalized;
  if (isIPv6(normalized)) {
    const groups = expandIPv6(normalized);
    if (!groups) return normalized;
    // /64 = the first 4 hextets.
    return `${groups[0]}:${groups[1]}:${groups[2]}:${groups[3]}::/64`;
  }
  return ip;
};

const expandIPv6 = (ip: string): string[] | null => {
  const [head, tail] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;
  return [...headGroups, ...Array(missing).fill('0'), ...tailGroups].map((g) =>
    g.toLowerCase().replace(/^0+(?=.)/, ''),
  );
};

/**
 * Whether an address can be geolocated at all: loopback, private, link-local, carrier-grade NAT and unique-local ranges
 * (and their IPv4-mapped forms) are not in any geolocation database. Invalid input counts as not public.
 */
export const isPublicIp = (ip: string): boolean => {
  if (!ip) return false;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(normalized)) {
    const [a, b] = normalized.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (isIPv6(normalized)) {
    const groups = expandIPv6(normalized);
    if (!groups) return false;
    const first = Number.parseInt(groups[0], 16);
    if (groups.every((g) => g === '0')) return false; // ::
    if (groups.slice(0, 7).every((g) => g === '0') && groups[7] === '1') return false; // ::1
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
    return true;
  }
  return false;
};
