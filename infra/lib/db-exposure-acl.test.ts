import { describe, expect, it } from 'vitest';
import { isIpv4, minAclPrefix, parseAclInput, toValidatedCidr } from './db-exposure-acl';

describe('isIpv4', () => {
  it('accepts valid dotted-quads', () => {
    expect(isIpv4('203.0.113.7')).toBe(true);
    expect(isIpv4('0.0.0.0')).toBe(true);
    expect(isIpv4('255.255.255.255')).toBe(true);
  });

  it('rejects malformed, out-of-range, and leading-zero octets', () => {
    expect(isIpv4('256.0.0.1')).toBe(false);
    expect(isIpv4('203.0.113')).toBe(false);
    expect(isIpv4('203.0.113.01')).toBe(false);
    expect(isIpv4('not-an-ip')).toBe(false);
  });
});

describe('toValidatedCidr', () => {
  it('adds /32 to a bare address', () => {
    expect(toValidatedCidr('203.0.113.7')).toEqual({ ok: true, cidr: '203.0.113.7/32' });
  });

  it('keeps a valid explicit prefix', () => {
    expect(toValidatedCidr(' 198.51.100.0/24 ')).toEqual({ ok: true, cidr: '198.51.100.0/24' });
  });

  it('refuses all-internet ranges', () => {
    expect(toValidatedCidr('0.0.0.0/0').ok).toBe(false);
    expect(toValidatedCidr('203.0.113.7/0').ok).toBe(false);
    expect(toValidatedCidr('0.0.0.0/32').ok).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(toValidatedCidr('203.0.113.7/33').ok).toBe(false);
    expect(toValidatedCidr('203.0.113.7/24/8').ok).toBe(false);
    expect(toValidatedCidr('').ok).toBe(false);
    expect(toValidatedCidr('not-an-ip/24').ok).toBe(false);
    expect(toValidatedCidr('2001:db8::/129').ok).toBe(false);
    expect(toValidatedCidr('fe80::1%eth0').ok).toBe(false);
  });

  it('must not open the database to a wide range without the escape hatch', () => {
    expect(minAclPrefix).toEqual({ ipv4: 24, ipv6: 48 });
    expect(toValidatedCidr('198.51.0.0/16')).toMatchObject({ ok: false, reason: expect.stringContaining('/24') });
    expect(toValidatedCidr('198.51.100.0/23').ok).toBe(false);
    expect(toValidatedCidr('2001:db8::/32')).toMatchObject({ ok: false, reason: expect.stringContaining('/48') });
    expect(toValidatedCidr('198.51.0.0/16', { allowWide: true })).toEqual({ ok: true, cidr: '198.51.0.0/16' });
    expect(toValidatedCidr('2001:db8::/32', { allowWide: true })).toEqual({ ok: true, cidr: '2001:db8::/32' });
  });

  it('must not open the database to the whole internet, even with the escape hatch', () => {
    for (const entry of ['0.0.0.0/0', '::/0', '::', '2001:db8::1/0', '0.0.0.0/8']) {
      expect(toValidatedCidr(entry, { allowWide: true }).ok).toBe(false);
    }
  });

  it('normalizes IPv6 entries', () => {
    expect(toValidatedCidr('2001:DB8:0:0::1')).toEqual({ ok: true, cidr: '2001:db8::1/128' });
    expect(toValidatedCidr('2001:db8:1234::/48')).toEqual({ ok: true, cidr: '2001:db8:1234::/48' });
  });
});

describe('parseAclInput', () => {
  it('parses and de-duplicates a comma-separated list', () => {
    expect(parseAclInput('203.0.113.7, 198.51.100.0/24, 203.0.113.7/32')).toEqual({
      ok: true,
      cidrs: ['203.0.113.7/32', '198.51.100.0/24'],
    });
  });

  it('fails on the first invalid entry', () => {
    const result = parseAclInput('203.0.113.7, 0.0.0.0/0');
    expect(result.ok).toBe(false);
  });

  it('fails when empty', () => {
    expect(parseAclInput('   ').ok).toBe(false);
  });
});
