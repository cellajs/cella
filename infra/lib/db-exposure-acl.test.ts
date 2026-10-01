import { describe, expect, it } from 'vitest';
import { parseAclInput } from './db-exposure-acl';

describe('parseAclInput: one entry', () => {
  it('adds /32 to a bare address', () => {
    expect(parseAclInput('203.0.113.7')).toEqual({ ok: true, cidrs: ['203.0.113.7/32'] });
    expect(parseAclInput('255.255.255.255')).toEqual({ ok: true, cidrs: ['255.255.255.255/32'] });
  });

  it('keeps a valid explicit prefix', () => {
    expect(parseAclInput(' 198.51.100.0/24 ')).toEqual({ ok: true, cidrs: ['198.51.100.0/24'] });
  });

  it('refuses all-internet ranges', () => {
    expect(parseAclInput('0.0.0.0/0').ok).toBe(false);
    expect(parseAclInput('203.0.113.7/0').ok).toBe(false);
    expect(parseAclInput('0.0.0.0/32').ok).toBe(false);
  });

  it('rejects malformed input', () => {
    for (const entry of ['203.0.113.7/33', '203.0.113.7/24/8', '', 'not-an-ip', 'not-an-ip/24', '256.0.0.1', '203.0.113', '203.0.113.01']) {
      expect(parseAclInput(entry).ok, entry).toBe(false);
    }
  });

  it('refuses IPv6 entries, naming the reason: the Scaleway database ACL takes IPv4 only', () => {
    for (const entry of ['2001:db8::1', '2001:db8:1234::/48', '2001:db8::/32', '::/0', 'fe80::1%eth0', '2001:db8::/129']) {
      expect(parseAclInput(entry, true), entry).toMatchObject({ ok: false, reason: expect.stringContaining('IPv4 only') });
    }
  });

  it('must not open the database to a wide range without the escape hatch', () => {
    expect(parseAclInput('198.51.0.0/16')).toMatchObject({ ok: false, reason: expect.stringContaining('/24') });
    expect(parseAclInput('198.51.100.0/23').ok).toBe(false);
    expect(parseAclInput('198.51.0.0/16', true)).toEqual({ ok: true, cidrs: ['198.51.0.0/16'] });
  });

  it('must not open the database to the whole internet, even with the escape hatch', () => {
    for (const entry of ['0.0.0.0/0', '::/0', '::', '2001:db8::1/0', '0.0.0.0/8']) {
      expect(parseAclInput(entry, true).ok, entry).toBe(false);
    }
  });

  it('must not open the database to all of IPv4 via an IPv4-mapped IPv6 range', () => {
    // The provider hands a mapped range to Scaleway as the IPv4 range it names, so it carries the IPv4 rules.
    for (const entry of ['::ffff:0.0.0.0/96', '::ffff:0:0/96', '::fffe:0:0/95', '::ffff:0.0.0.0/97']) {
      expect(parseAclInput(entry).ok, entry).toBe(false);
      expect(parseAclInput(entry, true).ok, entry).toBe(false);
    }
    // A mapped /112 is an IPv4 /16: wider than /24.
    expect(parseAclInput('::ffff:198.51.0.0/112')).toMatchObject({ ok: false, reason: expect.stringContaining('/24') });
    // Positive control: a narrow mapped range becomes the IPv4 range it names.
    expect(parseAclInput('::ffff:198.51.100.7')).toEqual({ ok: true, cidrs: ['198.51.100.7/32'] });
    expect(parseAclInput('::ffff:198.51.100.0/120')).toEqual({ ok: true, cidrs: ['198.51.100.0/24'] });
  });

  it('must not open the whole internet via the host bits of a wide range', () => {
    // 0.0.0.1/1 is 0.0.0.0/1: an entry is judged by the network it names.
    expect(parseAclInput('0.0.0.1/1', true).ok).toBe(false);
    expect(parseAclInput('198.51.100.7/24')).toEqual({ ok: true, cidrs: ['198.51.100.0/24'] });
  });
});

describe('parseAclInput: the list', () => {
  it('parses and de-duplicates a comma-separated list', () => {
    expect(parseAclInput('203.0.113.7, 198.51.100.0/24, 203.0.113.7/32')).toEqual({ ok: true, cidrs: ['203.0.113.7/32', '198.51.100.0/24'] });
  });

  it('fails on the first invalid entry', () => {
    const result = parseAclInput('203.0.113.7, 0.0.0.0/0');
    expect(result.ok).toBe(false);
  });

  it('fails when empty', () => {
    expect(parseAclInput('   ').ok).toBe(false);
  });

  it('must not open the whole internet via entries that together cover it', () => {
    // Two halves of IPv4 (the network of 0.0.0.1/1 is 0.0.0.0/1).
    expect(parseAclInput('0.0.0.1/1, 128.0.0.0/1', true).ok).toBe(false);
    // More than one entry could open: three quarters of IPv4, directly or through a mapped range.
    for (const acl of ['128.0.0.0/1, 64.0.0.0/2', '128.0.0.0/1, ::ffff:64.0.0.0/98']) {
      expect(parseAclInput(acl, true), acl).toMatchObject({ ok: false, reason: expect.stringContaining('more than half') });
    }
  });

  it('accepts a wide range that stays within half of IPv4 (positive control)', () => {
    expect(parseAclInput('128.0.0.0/1', true)).toEqual({ ok: true, cidrs: ['128.0.0.0/1'] });
    expect(parseAclInput('128.0.0.0/2, 64.0.0.0/2', true)).toEqual({ ok: true, cidrs: ['128.0.0.0/2', '64.0.0.0/2'] });
  });
});
