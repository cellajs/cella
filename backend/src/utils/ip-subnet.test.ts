import { describe, expect, it } from 'vitest';
import { isPublicIp, toRateLimitIp } from '#/utils/ip-subnet';

describe('toRateLimitIp', () => {
  it('keeps IPv4 addresses as the full host', () => {
    expect(toRateLimitIp('203.0.113.7')).toBe('203.0.113.7');
  });

  it('collapses IPv4-mapped IPv6 to plain IPv4', () => {
    expect(toRateLimitIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('buckets a single IPv6 address to its /64 prefix', () => {
    expect(toRateLimitIp('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd:1234::/64');
  });

  it('maps different addresses within the same /64 to the same key', () => {
    const a = toRateLimitIp('2001:db8:abcd:1234::1');
    const b = toRateLimitIp('2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
    expect(a).toBe(b);
  });

  it('maps different /64 prefixes to different keys', () => {
    const a = toRateLimitIp('2001:db8:abcd:1234::1');
    const b = toRateLimitIp('2001:db8:abcd:5678::1');
    expect(a).not.toBe(b);
  });

  it('treats differently-spelled forms of the same address identically', () => {
    const compressed = toRateLimitIp('2001:db8::1');
    const expanded = toRateLimitIp('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(compressed).toBe(expanded);
  });

  it('returns the input unchanged for non-IP values', () => {
    expect(toRateLimitIp('not-an-ip')).toBe('not-an-ip');
    expect(toRateLimitIp('')).toBe('');
  });
});

describe('isPublicIp', () => {
  it('accepts routable IPv4 and IPv6 addresses, mapped or not', () => {
    expect(isPublicIp('203.0.113.7')).toBe(true);
    expect(isPublicIp('::ffff:203.0.113.7')).toBe(true);
    expect(isPublicIp('2001:db8::1')).toBe(true);
  });

  it('rejects loopback, private, link-local, carrier NAT and unique-local ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '::ffff:127.0.0.1',
      '10.0.0.4',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.10.10',
      '100.64.0.1',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it('rejects the public neighbours of those ranges only when they are private', () => {
    expect(isPublicIp('172.15.0.1')).toBe(true);
    expect(isPublicIp('172.32.0.1')).toBe(true);
    expect(isPublicIp('100.63.0.1')).toBe(true);
    expect(isPublicIp('100.128.0.1')).toBe(true);
  });

  it('treats invalid input as not public', () => {
    expect(isPublicIp('')).toBe(false);
    expect(isPublicIp('not-an-ip')).toBe(false);
  });
});
