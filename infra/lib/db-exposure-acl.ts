// Pure rules for the database public-endpoint ACL, free of prompts and I/O. The CLI validates the operator's input
// with them, and the postgres store validates the stack config again before it creates the ACL.

import { isIPv6 } from 'node:net';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Narrowest prefix per family an ACL entry must have; a wider one needs `allowWide` (`infra:dbPublicAclAllowWide`). */
export const minAclPrefix = { ipv4: 24, ipv6: 48 } as const;

type Family = keyof typeof minAclPrefix;

const familyBits = { ipv4: 32, ipv6: 128 } as const;

/** `::ffff:0:0/96`: IPv4 clients reach the database as these IPv4-mapped IPv6 addresses, so the IPv4 rules apply. */
const mappedBlock = { start: 0xffffn << 32n, prefix: 96 };

/** True when a dotted-quad has four 0-255 octets with no leading zeros. */
export function isIpv4(ip: string): boolean {
  const match = IPV4.exec(ip.trim());
  if (!match) return false;
  return match.slice(1).every((octet) => {
    const n = Number(octet);
    return n >= 0 && n <= 255 && String(n) === octet;
  });
}

/** Canonical (compressed, lowercase) form of an IPv6 address, or undefined when it is not one; zone ids are refused. */
function canonicalIpv6(ip: string): string | undefined {
  if (!isIPv6(ip) || ip.includes('%')) return undefined;
  try {
    return new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return undefined;
  }
}

const ipv4ToBigInt = (ip: string): bigint => ip.split('.').reduce((value, octet) => (value << 8n) + BigInt(octet), 0n);

const bigIntToIpv4 = (value: bigint): string =>
  [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join('.');

/** A canonical IPv6 address (hex groups only, as `canonicalIpv6` writes it) as a number. */
function ipv6ToBigInt(canonical: string): bigint {
  const [head = '', tail] = canonical.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups = [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill('0'), ...tailGroups];
  return groups.reduce((value, group) => (value << 16n) + BigInt(Number.parseInt(group, 16)), 0n);
}

function bigIntToIpv6(value: bigint): string {
  const groups = Array.from({ length: 8 }, (_, index) => ((value >> BigInt(112 - index * 16)) & 0xffffn).toString(16));
  return canonicalIpv6(groups.join(':')) ?? groups.join(':');
}

/** The first address of the range an address and prefix name: host bits cleared. */
const networkOf = (address: bigint, prefix: number, bits: number): bigint =>
  prefix === 0 ? 0n : (address >> BigInt(bits - prefix)) << BigInt(bits - prefix);

/** One validated entry as the range of addresses it opens. */
interface AclRange {
  family: Family;
  network: bigint;
  prefix: number;
}

const cidrOf = ({ family, network, prefix }: AclRange) =>
  `${family === 'ipv4' ? bigIntToIpv4(network) : bigIntToIpv6(network)}/${prefix}`;

/** Result of validating one operator ACL entry into a canonical CIDR. */
export interface CidrCheck {
  ok: boolean;
  cidr?: string;
  reason?: string;
}

export interface AclOptions {
  /** Accept prefixes wider than `minAclPrefix` (never `/0` or the unspecified address). Default false. */
  allowWide?: boolean;
}

type RangeCheck = { ok: true; range: AclRange } | { ok: false; reason: string };

/** Parses one entry into the range it opens, IPv4-mapped IPv6 as the IPv4 range it names, and applies the rules. */
function toValidatedRange(entry: string, { allowWide = false }: AclOptions): RangeCheck {
  const raw = entry.trim();
  if (!raw) return { ok: false, reason: 'empty entry' };

  const parts = raw.split('/');
  if (parts.length > 2) return { ok: false, reason: `malformed CIDR '${raw}'` };
  const [ipRaw = '', prefixRaw] = parts;

  const written: Family = isIpv4(ipRaw) ? 'ipv4' : 'ipv6';
  const ip = written === 'ipv4' ? ipRaw : canonicalIpv6(ipRaw);
  if (!ip) return { ok: false, reason: `not a valid IP address: '${ipRaw || raw}'` };

  let prefix: number = familyBits[written];
  if (prefixRaw !== undefined) {
    if (!/^\d{1,3}$/.test(prefixRaw)) return { ok: false, reason: `invalid prefix in '${raw}'` };
    prefix = Number(prefixRaw);
    if (prefix > familyBits[written]) return { ok: false, reason: `prefix out of range in '${raw}'` };
  }

  let range: AclRange = {
    family: written,
    network: networkOf(written === 'ipv4' ? ipv4ToBigInt(ip) : ipv6ToBigInt(ip), prefix, familyBits[written]),
    prefix,
  };

  if (range.family === 'ipv6') {
    const mapped = networkOf(range.network, mappedBlock.prefix, 128) === mappedBlock.start;
    if (mapped && prefix >= mappedBlock.prefix) {
      range = { family: 'ipv4', network: range.network & 0xffffffffn, prefix: prefix - mappedBlock.prefix };
    } else if (prefix < mappedBlock.prefix && networkOf(mappedBlock.start, prefix, 128) === range.network) {
      return {
        ok: false,
        reason: `'${raw}' contains every IPv4-mapped address: it would expose the database to all of IPv4`,
      };
    }
  }

  const cidr = cidrOf(range);
  if (range.network === 0n || range.prefix === 0) {
    return { ok: false, reason: `'${cidr}' would expose the database to the entire internet` };
  }
  if (!allowWide && range.prefix < minAclPrefix[range.family]) {
    return {
      ok: false,
      reason: `'${cidr}' is wider than /${minAclPrefix[range.family]}; set infra:dbPublicAclAllowWide=true to allow it`,
    };
  }
  return { ok: true, range };
}

/**
 * Normalize a single operator entry to a canonical CIDR of the network it names: a bare address gains a host suffix
 * (`/32`, `/128`), host bits are cleared, and an IPv4-mapped IPv6 range becomes the IPv4 range it names, since IPv4
 * clients match it. Rejects malformed input, any range opening the database to the whole internet (a `/0`, the
 * unspecified network, or every IPv4-mapped address), and, unless `allowWide`, prefixes wider than `/24` (IPv4) or
 * `/48` (IPv6).
 */
export function toValidatedCidr(entry: string, options: AclOptions = {}): CidrCheck {
  const check = toValidatedRange(entry, options);
  return check.ok ? { ok: true, cidr: cidrOf(check.range) } : { ok: false, reason: check.reason };
}

/** How many addresses a set of ranges of one family opens, overlaps counted once. */
function coveredAddresses(ranges: AclRange[], bits: number): bigint {
  const spans = ranges
    .map(({ network, prefix }) => ({ start: network, end: network + (1n << BigInt(bits - prefix)) }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  let total = 0n;
  let reach = 0n;
  for (const { start, end } of spans) {
    if (end <= reach) continue;
    total += end - (start > reach ? start : reach);
    reach = end;
  }
  return total;
}

/** Validated ACL parse result: the normalized CIDR list, or the first error. */
export type AclParse = { ok: true; cidrs: string[] } | { ok: false; reason: string };

/**
 * Parse a comma-separated operator ACL string into de-duplicated canonical CIDRs, or return the first validation
 * failure. Together the entries may open no more than one entry may: half of an address family.
 */
export function parseAclInput(raw: string, options: AclOptions = {}): AclParse {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return { ok: false, reason: 'no CIDRs provided' };

  const cidrs: string[] = [];
  const ranges: AclRange[] = [];
  for (const entry of entries) {
    const check = toValidatedRange(entry, options);
    if (!check.ok) return { ok: false, reason: check.reason };
    const cidr = cidrOf(check.range);
    if (cidrs.includes(cidr)) continue;
    cidrs.push(cidr);
    ranges.push(check.range);
  }

  for (const family of ['ipv4', 'ipv6'] as const) {
    const bits = familyBits[family];
    const covered = coveredAddresses(
      ranges.filter((range) => range.family === family),
      bits,
    );
    if (covered > 1n << BigInt(bits - 1)) {
      const name = family === 'ipv4' ? 'IPv4' : 'IPv6';
      return {
        ok: false,
        reason: `'${cidrs.join(', ')}' together would expose the database to more than half of ${name}`,
      };
    }
  }
  return { ok: true, cidrs };
}
