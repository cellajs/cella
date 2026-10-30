import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetHLC, advanceClock, compareHLC, generateServerHLC, isValidHLC, maxClockSkewMs, parseHLC } from '#/core/stx/hlc';

describe('HLC wire format', () => {
  beforeEach(() => _resetHLC());
  afterEach(() => _resetHLC());

  it('parses canonical timestamps', () => {
    expect(parseHLC('1700000000000:0007:0abcd')).toEqual({ timestamp: 1700000000000n, counter: 7n, source: '0abcd' });
    expect(isValidHLC('1700000000000:0007:0abcd')).toBe(true);
  });

  it('rejects malformed timestamps', () => {
    expect(isValidHLC('')).toBe(false);
    expect(isValidHLC('1700000000000:7:abc')).toBe(false);
    expect(() => compareHLC('invalid', '1700000000000:0007:0abcd')).toThrow(/Invalid HLC/);
  });

  it('compares numeric counters independently of padding width', () => {
    expect(compareHLC('1700000000000:10000:0abcd', '1700000000000:9999:0abcd')).toBe(1);
    expect(compareHLC('1700000000000:0001:0abcd', '1700000000000:0001:0abce')).toBe(-1);
  });

  it('generates a server timestamp after an observed timestamp inside the skew bound', () => {
    const observed = `${Date.now() + maxClockSkewMs / 2}:0007:0abcd`;
    advanceClock(observed);

    expect(compareHLC(generateServerHLC(), observed)).toBe(1);
  });

  it("must not let one request's stamp move the server clock past the skew bound", () => {
    const bound = BigInt(Date.now() + maxClockSkewMs);
    for (const observed of ['9999999999999999:0000:abcde', `${Date.now() + maxClockSkewMs + 1000}:0000:abcde`]) {
      advanceClock(observed);
      expect(parseHLC(generateServerHLC())?.timestamp).toBeLessThanOrEqual(bound);
    }
  });

  it('must keep server stamps inside the pattern when the counter is at its maximum', () => {
    const observed = `${Date.now() + maxClockSkewMs / 2}:9999999999:abcde`;
    advanceClock(observed);

    const next = generateServerHLC();
    expect(isValidHLC(next)).toBe(true);
    expect(compareHLC(next, observed)).toBe(1);
  });
});
