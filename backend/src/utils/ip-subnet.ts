import { isIPv4, isIPv6 } from 'node:net';

/** Strips the IPv4-mapped IPv6 prefix, so 192.168.0.1, ::ffff:192.168.0.1 and ::ffff:c0a8:1 read as one address. */
const unmapIPv4 = (ip: string): string => {
  if (!ip.toLowerCase().startsWith('::ffff:')) return ip;
  const mapped = ip.slice(7);
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(mapped);
  if (!hex) return mapped;
  const [high, low] = [Number.parseInt(hex[1], 16), Number.parseInt(hex[2], 16)];
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
};

/**
 * Privacy-preserving subnet: IPv4 to /24, IPv6 to /48, `null` for invalid input. The canonical output
 * string is what `hashSubnet()` expects.
 */
export const toSubnet = (ip: string): string | null => {
  if (!ip) return null;
  const normalized = unmapIPv4(ip);
  if (isIPv4(normalized)) {
    const parts = normalized.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (isIPv6(normalized)) {
    const groups = expandIPv6(normalized);
    return groups ? `${groups[0]}:${groups[1]}:${groups[2]}::/48` : null;
  }
  return null;
};

/** Stable rate-limit buckets: IPv4 stays per host, IPv6 collapses to /64 so address rotation cannot evade it. */
export const toRateLimitIp = (ip: string): string => {
  if (!ip) return ip;
  const normalized = unmapIPv4(ip);
  if (isIPv4(normalized)) return normalized;
  if (isIPv6(normalized)) {
    const groups = expandIPv6(normalized);
    // /64 = the first 4 hextets.
    return groups ? `${groups[0]}:${groups[1]}:${groups[2]}:${groups[3]}::/64` : normalized;
  }
  return ip;
};

const expandIPv6 = (ip: string): string[] | null => {
  const [head, tail] = ip.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) return null;
  return [...headGroups, ...Array(missing).fill('0'), ...tailGroups].map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''));
};

/** Whether an IPv4 address lies outside the ranges no public host holds. */
const isPublicIPv4 = (ip: string): boolean => {
  const [a, b] = ip.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false; // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking
  return true;
};

/** The eight hextets of an IPv6 address as numbers, a dotted IPv4 tail read as the last two; null when malformed. */
const ipv6Hextets = (ip: string): number[] | null => {
  const dotted = /^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  const hex = dotted ? `${dotted[1]}${((+dotted[2] << 8) | +dotted[3]).toString(16)}:${((+dotted[4] << 8) | +dotted[5]).toString(16)}` : ip;
  return expandIPv6(hex)?.map((group) => Number.parseInt(group, 16)) ?? null;
};

const dottedIPv4 = (high: number, low: number) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

/** The 96-bit prefixes whose last 32 bits are an IPv4 address: IPv4-compatible (`::` and `::1` too), IPv4-mapped, NAT64. */
const ipv4CarryingPrefixes = new Set(['0:0:0:0:0:0', '0:0:0:0:0:ffff', '64:ff9b:0:0:0:0']);

/** The IPv4 address an IPv6 one carries: after an `ipv4CarryingPrefixes` prefix, or in bits 16 to 47 of 6to4 (2002::/16). */
const embeddedIPv4 = (hextets: number[]): string | null => {
  if (hextets[0] === 0x2002) return dottedIPv4(hextets[1], hextets[2]);
  const prefix = hextets
    .slice(0, 6)
    .map((hextet) => hextet.toString(16))
    .join(':');
  return ipv4CarryingPrefixes.has(prefix) ? dottedIPv4(hextets[6], hextets[7]) : null;
};

/**
 * Whether a public host may hold an address: loopback, private, link-local, carrier-grade NAT, benchmarking, multicast,
 * reserved, unique-local and site-local ranges are no public host's, and no geolocation database holds them. A form
 * that carries an IPv4 address (`embeddedIPv4`) is judged by that address. Invalid input counts as not public.
 */
export const isPublicIp = (ip: string): boolean => {
  if (isIPv4(ip)) return isPublicIPv4(ip);
  const hextets = isIPv6(ip) ? ipv6Hextets(ip) : null;
  if (!hextets) return false;
  const embedded = embeddedIPv4(hextets);
  if (embedded) return isPublicIPv4(embedded);
  const [first] = hextets;
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return false; // fe80::/10 link local, fec0::/10 site local
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
};
