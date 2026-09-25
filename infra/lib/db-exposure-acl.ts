// Pure rules for the database public-endpoint ACL, free of prompts and I/O. The CLI validates the operator's input
// with them, and the postgres store validates the stack config again before it creates the ACL.

import { isIPv6 } from 'node:net';

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Narrowest prefix per family an ACL entry must have; a wider one needs `allowWide` (`infra:dbPublicAclAllowWide`). */
export const minAclPrefix = { ipv4: 24, ipv6: 48 } as const;

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

/**
 * Normalize a single operator entry to a canonical CIDR: a bare address gains a host suffix (`/32`, `/128`).
 * Rejects malformed input, any range opening the database to the whole internet (a `/0` or the unspecified address),
 * and, unless `allowWide`, prefixes wider than `/24` (IPv4) or `/48` (IPv6).
 */
export function toValidatedCidr(entry: string, { allowWide = false }: AclOptions = {}): CidrCheck {
  const raw = entry.trim();
  if (!raw) return { ok: false, reason: 'empty entry' };

  const parts = raw.split('/');
  if (parts.length > 2) return { ok: false, reason: `malformed CIDR '${raw}'` };
  const [ipRaw, prefixRaw] = parts;

  const family = ipRaw && isIpv4(ipRaw) ? 'ipv4' : 'ipv6';
  const ip = family === 'ipv4' ? ipRaw : canonicalIpv6(ipRaw ?? '');
  if (!ip) return { ok: false, reason: `not a valid IP address: '${ipRaw ?? raw}'` };
  const maxPrefix = family === 'ipv4' ? 32 : 128;

  let prefix = maxPrefix;
  if (prefixRaw !== undefined) {
    if (!/^\d{1,3}$/.test(prefixRaw)) return { ok: false, reason: `invalid prefix in '${raw}'` };
    prefix = Number(prefixRaw);
    if (prefix > maxPrefix) return { ok: false, reason: `prefix out of range in '${raw}'` };
  }

  const cidr = `${ip}/${prefix}`;
  if (ip === '0.0.0.0' || ip === '::' || prefix === 0) {
    return { ok: false, reason: `'${cidr}' would expose the database to the entire internet` };
  }
  if (!allowWide && prefix < minAclPrefix[family]) {
    return {
      ok: false,
      reason: `'${cidr}' is wider than /${minAclPrefix[family]}; set infra:dbPublicAclAllowWide=true to allow it`,
    };
  }
  return { ok: true, cidr };
}

/** Validated ACL parse result: the normalized CIDR list, or the first error. */
export type AclParse = { ok: true; cidrs: string[] } | { ok: false; reason: string };

/** Parse a comma-separated operator ACL string into de-duplicated canonical CIDRs, or return the first validation failure. */
export function parseAclInput(raw: string, options: AclOptions = {}): AclParse {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return { ok: false, reason: 'no CIDRs provided' };

  const cidrs: string[] = [];
  for (const entry of entries) {
    const check = toValidatedCidr(entry, options);
    if (!check.ok || !check.cidr) return { ok: false, reason: check.reason ?? `invalid CIDR '${entry}'` };
    if (!cidrs.includes(check.cidr)) cidrs.push(check.cidr);
  }
  return { ok: true, cidrs };
}
