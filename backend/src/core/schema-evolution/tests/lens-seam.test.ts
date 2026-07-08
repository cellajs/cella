/**
 * Tests for the lens seams: wire-schema widening (update + create) and
 * ops normalization inside resolveUpdateOps.
 *
 * `shared/schema-evolution` is mocked with a synthetic expand rename lens
 * (attachment.name → title); `LENSLESS` is a synthetic entity without lenses,
 * exercising the passthrough
 * branches. End-to-end engine behavior with real lens modules is covered in
 * shared/src/schema-evolution/tests.
 */
import { z } from '@hono/zod-openapi';
import { describe, expect, it, vi } from 'vitest';

vi.mock('shared/schema-evolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/schema-evolution')>();
  return {
    ...actual,
    widenedOpsKeyMap: (entityType: string) => (entityType === 'attachment' ? { name: 'title' } : {}),
    normalizeOps: (
      entityType: string,
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
import { resolveUpdateOps } from '#/core/stx/resolve-update';

const stx = (fieldTimestamps: Record<string, string>) => ({ mutationId: 'm1', sourceId: 's1', fieldTimestamps });

// Synthetic lens-less entity — widenedOpsKeyMap/normalizeOps are mocked above by name
const LENSLESS = 'doc' as ProductEntityType;

describe('createUpdateSchema widening', () => {
  const schema = createUpdateSchema('attachment', { title: z.string(), originalKey: z.string() });

  it('accepts the old field name as alias during expand', () => {
    const parsed = schema.parse({ ops: { name: 'x' }, stx: stx({ name: 't' }) });
    expect(parsed.ops).toEqual({ name: 'x' });
  });

  it('still accepts the canonical field name', () => {
    const parsed = schema.parse({ ops: { title: 'x' }, stx: stx({ title: 't' }) });
    expect(parsed.ops).toEqual({ title: 'x' });
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
    const item = { id: '1', name: 'pic', stx: stx({ name: '100:0001:aaa' }) };
    const normalized = normalizeCreateItem('attachment', item);
    expect(normalized).toMatchObject({ id: '1', title: 'pic', name: 'pic' });
    expect(normalized.stx.fieldTimestamps).toEqual({ name: '100:0001:aaa', title: '100:0001:aaa' });
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
    stx: { mutationId: 'm0', sourceId: 's0', fieldTimestamps: { title: '100:0001:aaa', name: '100:0001:aaa' } },
  };

  it('canonicalizes old-shape ops before HLC resolution and writes both twins', () => {
    const resolved = resolveUpdateOps('attachment', entity, { name: 'new' }, stx({ name: '300:0001:bbb' }));
    expect(resolved.changed).toBe(true);
    if (!resolved.changed) return;
    expect(resolved.values).toEqual({ title: 'new', name: 'new' });
    expect(resolved.stx.fieldTimestamps.title).toBe('300:0001:bbb');
    expect(resolved.stx.fieldTimestamps.name).toBe('300:0001:bbb');
  });

  it('drops an old-shape op whose canonical twin has a newer stored HLC', () => {
    const freshEntity = {
      ...entity,
      stx: { ...entity.stx, fieldTimestamps: { title: '400:0001:ccc', name: '400:0001:ccc' } },
    };
    const resolved = resolveUpdateOps('attachment', freshEntity, { name: 'stale' }, stx({ name: '300:0001:bbb' }));
    expect(resolved.changed).toBe(false);
  });

  it('is passthrough for entities without lenses', () => {
    const pageEntity = { id: 'p1', name: 'old', stx: { mutationId: 'm0', sourceId: 's0', fieldTimestamps: {} } };
    const resolved = resolveUpdateOps(LENSLESS, pageEntity, { name: 'new' }, stx({ name: '300:0001:bbb' }));
    expect(resolved.changed).toBe(true);
    if (!resolved.changed) return;
    expect(resolved.values).toEqual({ name: 'new' });
  });
});
