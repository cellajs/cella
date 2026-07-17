import { z } from '@hono/zod-openapi';
import type { LensEntityType } from 'shared/schema-evolution';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A synthetic rename lens exercises widening and normalization. Shared tests cover
// complete engine behavior with real lens modules.
vi.mock('shared/schema-evolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/schema-evolution')>();
  return {
    ...actual,
    widenedOpsKeyMap: (entityType: LensEntityType) => (entityType === 'attachment' ? { name: 'title' } : {}),
    normalizeOps: (
      entityType: LensEntityType,
      ops: Record<string, unknown>,
      stx: { fieldTimestamps?: Record<string, unknown> },
    ) => {
      if (entityType !== 'attachment') return { ops, stx, unknownFields: [] };
      // Synthetic expand rename: canonicalize name → title, mirror-write the twin.
      const nextOps = { ...ops };
      if ('name' in nextOps) {
        nextOps.title = nextOps.name;
      }
      if ('title' in nextOps) nextOps.name = nextOps.title;
      const ft = stx.fieldTimestamps ? { ...stx.fieldTimestamps } : undefined;
      if (ft) {
        if ('name' in ft) ft.title = ft.name;
        if ('title' in ft) ft.name = ft.title;
      }
      return { ops: nextOps, stx: ft ? { ...stx, fieldTimestamps: ft } : stx, unknownFields: [] };
    },
  };
});

import type { ProductEntityType } from 'shared';
import { normalizeCreateItem, widenBodySchema } from '#/core/schema-evolution/lens-seam';
import { createUpdateSchema } from '#/core/schema-evolution/update-schema';
import { arrayDeltaSchema } from '#/core/stx/array-delta';
import { _resetHLC, compareHLC } from '#/core/stx/hlc';
import { resolveServerUpdateOps, resolveUpdateOps } from '#/core/stx/resolve-update';

const stx = (fieldTimestamps: Record<string, string>) => ({ mutationId: 'm1', sourceId: 's1', fieldTimestamps });
const hlc = '100:0001:aaaaa';

afterEach(() => _resetHLC());

// Synthetic lens-less entity; widenedOpsKeyMap/normalizeOps are mocked above by name.
const LENSLESS = 'doc' as ProductEntityType;

describe('createUpdateSchema widening', () => {
  const schema = createUpdateSchema('attachment', { title: z.string(), originalKey: z.string() });

  it('accepts the old field name as alias during expand', () => {
    const parsed = schema.parse({ ops: { name: 'x' }, stx: stx({ name: hlc }) });
    expect(parsed.ops).toEqual({ name: 'x' });
  });

  it('still accepts the canonical field name', () => {
    const parsed = schema.parse({ ops: { title: 'x' }, stx: stx({ title: hlc }) });
    expect(parsed.ops).toEqual({ title: 'x' });
  });

  it('rejects scalar ops without a matching HLC', () => {
    expect(() => schema.parse({ ops: { title: 'x' }, stx: stx({}) })).toThrow(/Missing HLC.*title/);
  });

  it('rejects malformed and unrelated HLC entries', () => {
    expect(() => schema.parse({ ops: { title: 'x' }, stx: stx({ title: 'invalid' }) })).toThrow(/Invalid HLC/);
    expect(() => schema.parse({ ops: { title: 'x' }, stx: stx({ title: hlc, other: hlc }) })).toThrow(
      /does not match a scalar op/,
    );
  });

  it('accepts an AWSet delta without an HLC', () => {
    const deltaSchema = createUpdateSchema(LENSLESS, { labels: arrayDeltaSchema });
    expect(deltaSchema.parse({ ops: { labels: { add: ['a'] } }, stx: stx({}) }).ops).toEqual({
      labels: { add: ['a'], remove: [] },
    });
    expect(() => deltaSchema.parse({ ops: { labels: { add: ['a'] } }, stx: stx({ labels: hlc }) })).toThrow(
      /does not match a scalar op/,
    );
  });

  it('does not alias entities without lenses (unknown key stripped → refine fails)', () => {
    const pageSchema = createUpdateSchema(LENSLESS, { title: z.string() });
    expect(() => pageSchema.parse({ ops: { bogus: 'x' }, stx: stx({}) })).toThrow();
  });
});

describe('widenBodySchema', () => {
  const body = z.object({ id: z.string(), title: z.string(), size: z.number().optional() });

  it('is identity for entities without lenses', () => {
    const widened = widenBodySchema(LENSLESS, body);
    expect(widened).toBe(body);
  });

  it('accepts the alias in place of a required canonical field', () => {
    const widened = widenBodySchema('attachment', body);
    expect(widened.parse({ id: '1', name: 'x' })).toEqual({ id: '1', name: 'x' });
    expect(widened.parse({ id: '1', title: 'x' })).toEqual({ id: '1', title: 'x' });
  });

  it('rejects when neither alias nor canonical is present', () => {
    const widened = widenBodySchema('attachment', body);
    expect(() => widened.parse({ id: '1' })).toThrow(/title/);
  });
});

describe('normalizeCreateItem', () => {
  it('canonicalizes old-shape create bodies and mirrors the twin', () => {
    const item = { id: '1', name: 'pic', stx: stx({ name: hlc }) };
    const normalized = normalizeCreateItem('attachment', item);
    expect(normalized).toMatchObject({ id: '1', title: 'pic', name: 'pic' });
    expect(normalized.stx.fieldTimestamps).toEqual({ name: hlc, title: hlc });
  });

  it('is passthrough for entities without lenses', () => {
    const item = { id: '1', name: 'doc', stx: stx({}) };
    expect(normalizeCreateItem(LENSLESS, item)).toEqual(item);
  });
});

describe('resolveUpdateOps lens seam', () => {
  const entity = {
    id: 'a1',
    title: 'old',
    name: 'old',
    stx: { mutationId: 'm0', sourceId: 's0', fieldTimestamps: { title: hlc, name: hlc } },
  };

  it('canonicalizes old-shape ops before HLC resolution and writes both twins', () => {
    const incomingHLC = '300:0001:bbbbb';
    const resolved = resolveUpdateOps('attachment', entity, { name: 'new' }, stx({ name: incomingHLC }));
    expect(resolved.changed).toBe(true);
    if (!resolved.changed) return;
    expect(resolved.values).toEqual({ title: 'new', name: 'new' });
    expect(resolved.stx.fieldTimestamps.title).toBe(incomingHLC);
    expect(resolved.stx.fieldTimestamps.name).toBe(incomingHLC);
  });

  it('drops an old-shape op whose canonical twin has a newer stored HLC', () => {
    const freshEntity = {
      ...entity,
      stx: { ...entity.stx, fieldTimestamps: { title: '400:0001:ccccc', name: '400:0001:ccccc' } },
    };
    const resolved = resolveUpdateOps('attachment', freshEntity, { name: 'stale' }, stx({ name: '300:0001:bbbbb' }));
    expect(resolved.changed).toBe(false);
  });

  it('is passthrough for entities without lenses', () => {
    const pageEntity = { id: 'p1', name: 'old', stx: { mutationId: 'm0', sourceId: 's0', fieldTimestamps: {} } };
    const resolved = resolveUpdateOps(LENSLESS, pageEntity, { name: 'new' }, stx({ name: '300:0001:bbbbb' }));
    expect(resolved.changed).toBe(true);
    if (!resolved.changed) return;
    expect(resolved.values).toEqual({ name: 'new' });
  });
});

describe('resolveServerUpdateOps', () => {
  it('assigns one causally-new HLC to normalized scalar twins', () => {
    const storedHLC = '9999999999999:0007:aaaaa';
    const entity = {
      id: 'a1',
      title: 'old',
      name: 'old',
      stx: { mutationId: 'm0', sourceId: 's0', fieldTimestamps: { title: storedHLC, name: storedHLC } },
    };

    const resolved = resolveServerUpdateOps('attachment', entity, { title: 'new' });
    expect(resolved.changed).toBe(true);
    if (!resolved.changed) return;
    expect(resolved.values).toEqual({ title: 'new', name: 'new' });
    expect(resolved.stx.sourceId).toBe('server');
    expect(resolved.stx.fieldTimestamps.title).toBe(resolved.stx.fieldTimestamps.name);
    expect(compareHLC(resolved.stx.fieldTimestamps.title, storedHLC)).toBe(1);
  });
});
