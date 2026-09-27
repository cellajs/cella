import { describe, expect, it } from 'vitest';
import { defineServices } from '../../compose/infrastructure';
import { fakeService as base } from '../helpers/fake-config';

// pathPrefix feeds the LB's raw matchPathBegin string, where a malformed or duplicated prefix misroutes traffic, so defineServices rejects it at synth/plan time.
describe('pathPrefix registry validation', () => {
  it('accepts a single lowercase segment with a leading slash', () => {
    expect(() => defineServices({ a: { ...base, lbRoute: 'default', pathPrefix: '/api' } })).not.toThrow();
  });

  it('rejects a prefix on an internal-only service (no lbRoute → no LB backend)', () => {
    expect(() => defineServices({ a: { ...base, pathPrefix: '/api' } })).toThrow(/without lbRoute/);
  });

  it("rejects lbRoute 'path' without a prefix (nothing would route to it)", () => {
    expect(() => defineServices({ a: { ...base, lbRoute: 'path' } })).toThrow(/no pathPrefix/);
  });

  it('rejects trailing slashes, nested segments, and uppercase', () => {
    for (const bad of ['/api/', '/api/v1', '/API', 'api']) {
      // @ts-expect-error: 'api' (no leading slash) is also a type error; the rest fail at runtime
      expect(() => defineServices({ a: { ...base, lbRoute: 'default', pathPrefix: bad } })).toThrow(/pathPrefix/);
    }
  });

  it('rejects two services claiming the same prefix', () => {
    expect(() =>
      defineServices({
        a: { ...base, lbRoute: 'default', pathPrefix: '/api' },
        b: { ...base, lbRoute: 'host', pathPrefix: '/api' },
      }),
    ).toThrow(/unique/);
  });
});
