// Pure helpers for validating the operator-supplied public-endpoint ACL. Kept
// free of prompts and I/O so the validation rules are unit-testable in isolation.

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** True when a dotted-quad has four 0-255 octets with no leading zeros. */
export function isIpv4(ip: string): boolean {
  const match = IPV4.exec(ip.trim())
  if (!match) return false
  return match.slice(1).every((octet) => {
    const n = Number(octet)
    return n >= 0 && n <= 255 && String(n) === octet
  })
}

/** Result of validating one operator ACL entry into a canonical CIDR. */
export interface CidrCheck {
  ok: boolean
  cidr?: string
  reason?: string
}

/**
 * Normalize a single operator entry to a canonical IPv4 CIDR and validate it. A
 * bare address gains a `/32` host suffix. Rejects malformed input and any range
 * that would open the database to the whole internet (`0.0.0.0/...` or a `/0`).
 */
export function toValidatedCidr(entry: string): CidrCheck {
  const raw = entry.trim()
  if (!raw) return { ok: false, reason: 'empty entry' }

  const parts = raw.split('/')
  if (parts.length > 2) return { ok: false, reason: `malformed CIDR '${raw}'` }
  const [ip, prefixRaw] = parts
  if (!ip || !isIpv4(ip)) return { ok: false, reason: `not a valid IPv4 address: '${ip ?? raw}'` }

  let prefix = 32
  if (prefixRaw !== undefined) {
    if (!/^\d{1,2}$/.test(prefixRaw)) return { ok: false, reason: `invalid prefix in '${raw}'` }
    prefix = Number(prefixRaw)
    if (prefix > 32) return { ok: false, reason: `prefix out of range in '${raw}'` }
  }

  const cidr = `${ip}/${prefix}`
  if (ip === '0.0.0.0' || prefix === 0) {
    return { ok: false, reason: `'${cidr}' would expose the database to the entire internet` }
  }
  return { ok: true, cidr }
}

/** Validated ACL parse result: the normalized CIDR list, or the first error. */
export type AclParse = { ok: true; cidrs: string[] } | { ok: false; reason: string }

/**
 * Parse a comma-separated operator ACL string into canonical CIDRs. Returns the
 * first validation failure, or the de-duplicated normalized list.
 */
export function parseAclInput(raw: string): AclParse {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (entries.length === 0) return { ok: false, reason: 'no CIDRs provided' }

  const cidrs: string[] = []
  for (const entry of entries) {
    const check = toValidatedCidr(entry)
    if (!check.ok || !check.cidr) return { ok: false, reason: check.reason ?? `invalid CIDR '${entry}'` }
    if (!cidrs.includes(check.cidr)) cidrs.push(check.cidr)
  }
  return { ok: true, cidrs }
}
