import { describe, expect, it } from 'vitest';
import { ipAllowed, ipCondition, ipConditionCidrs } from './ip-lock';

describe('ipCondition', () => {
  it('lists single addresses in one `in`', () => {
    expect(ipCondition(['203.0.113.7/32'])).toBe("request.ip in ['203.0.113.7']");
    expect(ipCondition(['203.0.113.7/32', '198.51.100.9/32'])).toBe("request.ip in ['203.0.113.7', '198.51.100.9']");
  });

  it('gives every wider range its own cidr() term', () => {
    expect(ipCondition(['203.0.113.0/24', '198.51.100.0/28'])).toBe(
      "cidr('203.0.113.0/24').containsIP(request.ip) || cidr('198.51.100.0/28').containsIP(request.ip)",
    );
  });

  it('joins single addresses and ranges with `||`', () => {
    expect(ipCondition(['203.0.113.7/32', '198.51.100.0/24'])).toBe(
      "request.ip in ['203.0.113.7'] || cidr('198.51.100.0/24').containsIP(request.ip)",
    );
  });

  it('must not produce a rule that admits every address: an empty list throws', () => {
    expect(() => ipCondition([])).toThrow(/never be written without its condition/);
  });

  it('must not let a quote or an expression into the condition: anything but an IPv4 CIDR throws', () => {
    expect(() => ipCondition(["203.0.113.7'] || true || request.ip in ['x/32"])).toThrow(/not an IPv4 CIDR/);
    expect(() => ipCondition(['203.0.113.7'])).toThrow(/not an IPv4 CIDR/);
    expect(() => ipCondition(['2001:db8::1/128'])).toThrow(/not an IPv4 CIDR/);
  });
});

describe('ipConditionCidrs', () => {
  it('reads back what ipCondition wrote', () => {
    for (const cidrs of [
      ['203.0.113.7/32'],
      ['203.0.113.7/32', '198.51.100.9/32'],
      ['203.0.113.0/24'],
      ['203.0.113.7/32', '198.51.100.0/24', '192.0.2.0/28'],
    ]) {
      expect(ipConditionCidrs(ipCondition(cidrs))).toEqual(cidrs);
    }
  });

  it('is empty for no condition and for one of another shape, so a foreign rule never passes for a lock', () => {
    expect(ipConditionCidrs(undefined)).toEqual([]);
    expect(ipConditionCidrs('')).toEqual([]);
    expect(ipConditionCidrs('resource.name.startsWith("/backend/")')).toEqual([]);
    expect(ipConditionCidrs("request.ip in ['203.0.113.7'] || true")).toEqual([]);
  });
});

describe('ipAllowed', () => {
  it('matches a single address exactly', () => {
    expect(ipAllowed('203.0.113.7', ['203.0.113.7/32'])).toBe(true);
    expect(ipAllowed('203.0.113.8', ['203.0.113.7/32'])).toBe(false);
  });

  it('matches an address inside a range and refuses its neighbours', () => {
    expect(ipAllowed('198.51.100.200', ['203.0.113.7/32', '198.51.100.0/24'])).toBe(true);
    expect(ipAllowed('198.51.101.1', ['198.51.100.0/24'])).toBe(false);
    expect(ipAllowed('198.51.100.17', ['198.51.100.0/28'])).toBe(false);
  });

  it('refuses every address for an empty list', () => {
    expect(ipAllowed('203.0.113.7', [])).toBe(false);
  });
});
