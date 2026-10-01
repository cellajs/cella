// Pure rules for the database public-endpoint ACL, free of prompts and I/O. The CLI validates the operator's input
// with them, and the postgres store validates the stack config again before it creates the ACL. Scaleway's database
// ACL takes IPv4 CIDRs only (the provider refuses IPv6 at apply time), so these are IPv4 rules.

import { isIP } from 'node:net';

/** Narrowest prefix an entry may have without `allowWide` (`infra:dbPublicAclAllowWide`). */
const minPrefix = 24;

/**
 * `::ffff:a.b.c.d[/96-128]`, an IPv4-mapped IPv6 entry, as dual-stack servers log IPv4 clients. It names an IPv4
 * range, and the provider's Go net package would hand it to Scaleway as one, so it reads as `a.b.c.d/N-96`.
 */
const MAPPED = /^::ffff:(\d+(?:\.\d+){3})(?:\/(9[6-9]|1[01]\d|12[0-8]))?$/i;

type EntryCheck = { ok: true; cidr: string; size: number } | { ok: false; reason: string };

/** The canonical CIDR one entry names and the number of addresses it opens, after the single-entry rules. */
function checkEntry(entry: string, allowWide: boolean): EntryCheck {
  const mapped = MAPPED.exec(entry);
  const text = mapped ? `${mapped[1]}/${Number(mapped[2] ?? 128) - 96}` : entry;
  const [ip = '', prefixText, ...extra] = text.split('/');
  const kind = isIP(ip);
  if (kind === 6) return { ok: false, reason: `'${entry}' is IPv6; the Scaleway database ACL takes IPv4 only` };
  if (kind !== 4 || extra.length) return { ok: false, reason: `not an IPv4 address or CIDR: '${entry}'` };
  const prefix = prefixText === undefined ? 32 : /^\d{1,2}$/.test(prefixText) ? Number(prefixText) : 33;
  if (prefix > 32) return { ok: false, reason: `invalid prefix in '${entry}'` };

  const size = 2 ** (32 - prefix);
  const network = Math.floor(ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0) / size) * size;
  const cidr = `${[24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join('.')}/${prefix}`;
  if (network === 0 || prefix === 0) {
    return { ok: false, reason: `'${cidr}' would expose the database to the entire internet` };
  }
  if (!allowWide && prefix < minPrefix) {
    return { ok: false, reason: `'${cidr}' is wider than /${minPrefix}; set infra:dbPublicAclAllowWide=true to allow it` };
  }
  return { ok: true, cidr, size };
}

/** Validated ACL: the canonical CIDR list, or the first refusal. */
export type AclParse = { ok: true; cidrs: string[] } | { ok: false; reason: string };

/**
 * Parse a comma-separated operator ACL into de-duplicated canonical IPv4 CIDRs, or return the first refusal. Each
 * entry becomes the network it names: a bare address gains `/32`, host bits are cleared, and an IPv4-mapped IPv6
 * entry becomes the IPv4 range it names. Refused: IPv6 and malformed input, any range opening the database to the
 * whole internet (a `/0` or the unspecified network), a prefix wider than `/24` unless `allowWide`, and entries that
 * together open more than half of IPv4, the most one entry may open. Sizes add up as written, so nested wide ranges
 * count twice; they are redundant anyway.
 */
export function parseAclInput(raw: string, allowWide = false): AclParse {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return { ok: false, reason: 'no CIDRs provided' };

  const cidrs: string[] = [];
  let opened = 0;
  for (const entry of entries) {
    const check = checkEntry(entry, allowWide);
    if (!check.ok) return check;
    if (cidrs.includes(check.cidr)) continue;
    cidrs.push(check.cidr);
    opened += check.size;
    if (opened > 2 ** 31) {
      return { ok: false, reason: `'${cidrs.join(', ')}' together would expose the database to more than half of IPv4` };
    }
  }
  return { ok: true, cidrs };
}
