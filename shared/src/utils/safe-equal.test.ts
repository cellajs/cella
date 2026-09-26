import { describe, expect, it } from 'vitest';
import { safeEqual } from './safe-equal';

describe('safeEqual', () => {
  it('accepts only the identical string', () => {
    expect(safeEqual('test-cdc-secret-min16chars', 'test-cdc-secret-min16chars')).toBe(true);
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('sécret-ü', 'sécret-ü')).toBe(true);
  });

  it('must not accept a guess of any length or casing', () => {
    expect(safeEqual('test-cdc-secret-min16chars', 'test-cdc-secret-min16charz')).toBe(false);
    expect(safeEqual('test-cdc-secret-min16chars', 'test-cdc-secret')).toBe(false);
    expect(safeEqual('test-cdc-secret', 'test-cdc-secret-min16chars')).toBe(false);
    expect(safeEqual('Secret', 'secret')).toBe(false);
    expect(safeEqual('secret', '')).toBe(false);
  });
});
