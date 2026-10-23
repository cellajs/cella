import { describe, expect, it } from 'vitest';
import { formatCount } from '~/utils/format-count';

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1k'],
    [1049, '1k'],
    [1500, '1.5k'],
    [1999, '1.9k'],
    [9999, '9.9k'],
    [21312, '21k'],
    [999_999, '999k'],
    [1_000_000, '1M'],
    [1_234_567, '1.2M'],
    [21_312_000, '21M'],
  ])('%i -> %s', (count, expected) => {
    expect(formatCount(count)).toBe(expected);
  });
});
