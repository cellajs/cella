import { describe, expect, it } from 'vitest';
import { toRateLimitIp } from '#/utils/ip-subnet';

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
