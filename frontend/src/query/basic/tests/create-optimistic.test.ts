import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getSchemaDefaults } from '~/query/basic/create-optimistic';

/**
 * The default walker reads zod's `def` payloads, whose field names are the library's to change.
 * One schema holds every node the walker reads, so a zod upgrade that renames a payload field fails
 * here. A silent failure would degrade every optimistic entity to nulls.
 */
describe('getSchemaDefaults', () => {
  it('defaults every zod node the walker reads', () => {
    const defaults: Record<string, unknown> = getSchemaDefaults(
      z.object({
        name: z.string(),
        count: z.number(),
        big: z.bigint(),
        flag: z.boolean(),
        at: z.date(),
        list: z.array(z.string()),
        bag: z.record(z.string(), z.string()),
        lookup: z.map(z.string(), z.string()),
        unique: z.set(z.string()),
        nested: z.object({ inner: z.string() }),
        pair: z.tuple([z.string(), z.number()]),
        role: z.enum(['admin', 'member']),
        kind: z.literal('page'),
        nullFirst: z.union([z.string(), z.null()]),
        either: z.union([z.number(), z.boolean()]),
        maybe: z.string().optional(),
        empty: z.string().nullable(),
        preset: z.string().default('seed'),
        generated: z.string().default(() => 'computed'),
      }),
    );

    expect(defaults).toEqual({
      name: '',
      count: 0,
      big: 0,
      flag: false,
      at: expect.any(String),
      list: [],
      bag: {},
      lookup: new Map(),
      unique: new Set(),
      nested: { inner: '' },
      pair: ['', 0],
      role: 'admin',
      kind: 'page',
      nullFirst: null,
      either: 0,
      maybe: '',
      empty: null,
      preset: 'seed',
      generated: 'computed',
    });
    // The walker emits an ISO string for a date field, which `z.infer` types as `Date`.
    expect(new Date(String(defaults.at)).toISOString()).toBe(defaults.at);
  });
});
