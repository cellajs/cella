import { isIPv4, isIPv6 } from 'node:net';

/**
 * Reduce an IP to its enclosing privacy-preserving subnet.
 * - IPv4 → /24 (zero the last octet, e.g. `1.2.3.4` → `1.2.3.0/24`)
 * - IPv6 → /48 (keep first 3 groups, e.g. `2001:db8:abcd:1234::1` → `2001:db8:abcd::/48`)
 *
 * Returns `null` for invalid input. The output is a canonical string suitable
 * for hashing with `hashSubnet()`.
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
    // Expand to full form, take first 3 groups, zero the rest.
    const groups = expandIPv6(normalized);
    if (!groups) return null;
    return `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
  }
  return null;
};

/**
 * Normalize a client IP into a stable rate-limit bucket key component.
 *
 * - Strips the IPv4-mapped IPv6 prefix so `192.168.0.1` and `::ffff:192.168.0.1`
 *   collapse to the same key.
 * - IPv4 → kept as the full address (per-host limiting).
 * - IPv6 → collapsed to the /64 prefix. A single client is typically allocated
 *   an entire /64 (or larger) and can freely rotate addresses within it, so
 *   keying on the raw address is bypassable. Bucketing by /64 closes that gap.
 * - Returns the input unchanged when it is not a recognizable IP.
 */
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
