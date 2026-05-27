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
