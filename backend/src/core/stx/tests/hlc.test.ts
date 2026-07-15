import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetHLC, advanceClock, compareHLC, generateServerHLC, isValidHLC, parseHLC } from '#/core/stx/hlc';

describe('HLC wire format', () => {
  beforeEach(() => _resetHLC());
  afterEach(() => _resetHLC());

  it('parses canonical timestamps', () => {
    expect(parseHLC('1700000000000:0007:0abcd')).toEqual({
      timestamp: 1700000000000n,
      counter: 7n,
      source: '0abcd',
    });
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

  it('generates a server timestamp after an observed future timestamp', () => {
    const observed = '9999999999999:0007:0abcd';
    advanceClock(observed);

    expect(compareHLC(generateServerHLC(), observed)).toBe(1);
  });
});
