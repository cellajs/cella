// Pure rules for the database public-endpoint ACL, free of prompts and I/O. The CLI validates the operator's input
// with them, and the postgres store validates the stack config again before it creates the ACL.

import { isIP } from 'node:net';

type Family = 4 | 6;

const bits: Record<Family, number> = { 4: 32, 6: 128 };

/** Narrowest prefix per family an entry may have without `allowWide` (`infra:dbPublicAclAllowWide`). */
const minPrefix: Record<Family, number> = { 4: 24, 6: 48 };

/**
 * `::ffff:0:0/96`, the IPv4-mapped block. The provider hands a range inside it to Scaleway as the IPv4 range it names
 * (Go's `IPNet.String`), so such an entry carries the IPv4 rules; a range containing the block is all of IPv4.
 */
const mappedBlock = 0xffffn << 32n;

/** The address of an entry as a number with its family; undefined when it is not an IP address (zone ids included). */
function parseAddress(ip: string): { family: Family; value: bigint } | undefined {
  const kind = isIP(ip);
  if (kind === 4)
    return { family: 4, value: ip.split('.').reduce((value, octet) => (value << 8n) | BigInt(octet), 0n) };
  if (kind !== 6 || ip.includes('%')) return undefined;
  // The URL parser takes every written IPv6 form and emits lowercase hex groups around at most one `::` gap.
  const [head = '', tail = ''] = new URL(`http://[${ip}]/`).hostname.slice(1, -1).split('::');
  const groups = (part: string) => (part ? part.split(':') : []);
  const gap = Array<string>(8 - groups(head).length - groups(tail).length).fill('0');
  const value = [...groups(head), ...gap, ...groups(tail)].reduce(
    (sum, group) => (sum << 16n) | BigInt(`0x${group}`),
    0n,
  );
  return { family: 6, value };
}

/** One validated entry: the network it names, host bits cleared. */
interface Range {
  family: Family;
  network: bigint;
  prefix: number;
}

/** Canonical CIDR text of a range: dotted quad, or the compressed lowercase IPv6 form the URL parser writes. */
function cidrOf({ family, network, prefix }: Range): string {
  const groups = Array.from({ length: 8 }, (_, index) =>
    ((network >> BigInt(112 - index * 16)) & 0xffffn).toString(16),
  );
  const address =
    family === 4
      ? [24n, 16n, 8n, 0n].map((shift) => (network >> shift) & 0xffn).join('.')
      : new URL(`http://[${groups.join(':')}]/`).hostname.slice(1, -1);
  return `${address}/${prefix}`;
}

type EntryCheck = { ok: true; range: Range } | { ok: false; reason: string };

/** The range one entry opens, an IPv4-mapped IPv6 range as the IPv4 range it names, after the single-entry rules. */
function checkEntry(entry: string, allowWide: boolean): EntryCheck {
  const [ipText = '', prefixText, ...extra] = entry.split('/');
  const address = parseAddress(ipText);
  if (!address || extra.length) return { ok: false, reason: `not an IP address or CIDR: '${entry}'` };
  let { family, value } = address;
  let prefix = prefixText === undefined ? bits[family] : /^\d{1,3}$/.test(prefixText) ? Number(prefixText) : Number.NaN;
  if (!(prefix <= bits[family])) return { ok: false, reason: `invalid prefix in '${entry}'` };

  // The entry and the mapped block nest when their first min(prefix, 96) bits agree: inside the block (prefix >= 96) the entry is the IPv4 range it names, around it (prefix < 96) all of IPv4.
  const shared = BigInt(128 - Math.min(prefix, 96));
  if (family === 6 && value >> shared === mappedBlock >> shared) {
    family = 4;
    value &= 0xffffffffn;
    prefix = Math.max(prefix - 96, 0);
  }

  const host = BigInt(bits[family] - prefix);
  const range: Range = { family, network: (value >> host) << host, prefix };
  const cidr = cidrOf(range);
  const named = cidr === entry ? `'${entry}'` : `'${entry}' (${cidr})`;
  if (range.network === 0n || prefix === 0) {
    return { ok: false, reason: `${named} would expose the database to the entire internet` };
  }
  if (!allowWide && prefix < minPrefix[family]) {
    return {
      ok: false,
      reason: `${named} is wider than /${minPrefix[family]}; set infra:dbPublicAclAllowWide=true to allow it`,
    };
  }
  return { ok: true, range };
}

/** Validated ACL: the canonical CIDR list, or the first refusal. */
export type AclParse = { ok: true; cidrs: string[] } | { ok: false; reason: string };

/**
 * Parse a comma-separated operator ACL into de-duplicated canonical CIDRs, or return the first refusal. Each entry
 * becomes the network it names: a bare address gains `/32` or `/128`, host bits are cleared, and an IPv4-mapped IPv6
 * range becomes the IPv4 range it names. Refused: malformed input, any range opening the database to the whole
 * internet (a `/0`, the unspecified network, every IPv4-mapped address), a prefix wider than `/24` (IPv4) or `/48`
 * (IPv6) unless `allowWide`, and entries that together open more than half of a family, the most one entry may open.
 * Sizes add up as written, so nested wide ranges count twice; they are redundant anyway.
 */
export function parseAclInput(raw: string, allowWide = false): AclParse {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return { ok: false, reason: 'no CIDRs provided' };

  const cidrs: string[] = [];
  const opened: Record<Family, bigint> = { 4: 0n, 6: 0n };
  for (const entry of entries) {
    const check = checkEntry(entry, allowWide);
    if (!check.ok) return check;
    const { family, prefix } = check.range;
    const cidr = cidrOf(check.range);
    if (cidrs.includes(cidr)) continue;
    cidrs.push(cidr);
    opened[family] += 1n << BigInt(bits[family] - prefix);
    if (opened[family] > 1n << BigInt(bits[family] - 1)) {
      return {
        ok: false,
        reason: `'${cidrs.join(', ')}' together would expose the database to more than half of IPv${family}`,
      };
    }
  }
  return { ok: true, cidrs };
}
