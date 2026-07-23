import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getSchemaDefaults } from '../create-optimistic';

/**
 * The default walker reads zod's `def` payloads, whose field names are the library's to change.
 * These cases pin one schema per branch, so a zod upgrade that renames a payload field fails
 * here. A silent failure would degrade every optimistic entity to nulls.
 */
describe('getSchemaDefaults', () => {
  it('defaults each primitive to its empty value', () => {
    const defaults = getSchemaDefaults(
      z.object({ name: z.string(), count: z.number(), big: z.bigint(), flag: z.boolean() }),
    );
    expect(defaults).toEqual({ name: '', count: 0, big: 0, flag: false });
  });

  // The walker emits an ISO string for a date field, which `z.infer` types as `Date`.
  it('defaults a date to an ISO string', () => {
    const defaults: Record<string, unknown> = getSchemaDefaults(z.object({ at: z.date() }));
    const at = defaults.at;
    expect(typeof at).toBe('string');
    expect(new Date(String(at)).toISOString()).toBe(at);
  });

  it('defaults collections to empty instances', () => {
    const defaults = getSchemaDefaults(
      z.object({
        list: z.array(z.string()),
        bag: z.record(z.string(), z.string()),
        lookup: z.map(z.string(), z.string()),
        unique: z.set(z.string()),
      }),
    );
    expect(defaults).toEqual({ list: [], bag: {}, lookup: new Map(), unique: new Set() });
  });

  it('recurses into nested objects and tuples', () => {
    const defaults = getSchemaDefaults(
      z.object({ nested: z.object({ inner: z.string() }), pair: z.tuple([z.string(), z.number()]) }),
    );
    expect(defaults).toEqual({ nested: { inner: '' }, pair: ['', 0] });
  });

  it('takes the first enum entry and the literal value', () => {
    const defaults = getSchemaDefaults(z.object({ role: z.enum(['admin', 'member']), kind: z.literal('page') }));
    expect(defaults).toEqual({ role: 'admin', kind: 'page' });
  });

  it('prefers the null member of a union, else the first', () => {
    const defaults = getSchemaDefaults(
      z.object({ maybe: z.union([z.string(), z.null()]), either: z.union([z.number(), z.boolean()]) }),
    );
    expect(defaults).toEqual({ maybe: null, either: 0 });
  });

  it('unwraps optional, nullable, and default wrappers', () => {
    const defaults = getSchemaDefaults(
      z.object({ maybe: z.string().optional(), empty: z.string().nullable(), preset: z.string().default('seed') }),
    );
    expect(defaults).toEqual({ maybe: '', empty: null, preset: 'seed' });
  });

  it('calls a function-valued default', () => {
    const { generated } = getSchemaDefaults(z.object({ generated: z.string().default(() => 'computed') }));
    expect(generated).toBe('computed');
  });
});
