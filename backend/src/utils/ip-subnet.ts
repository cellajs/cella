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
