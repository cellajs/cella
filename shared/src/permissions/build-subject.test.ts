import {
  appConfig,
  buildSubject,
  buildSubjectFromEntity,
  hierarchy,
  MissingScopeError,
  own,
  publicRow,
  rowPredicateMatches,
} from 'shared';
import { describe, expect, it } from 'vitest';

describe('shared buildSubject', () => {
  // Use the first product type with ancestors (e.g., attachment → organization)
  const productWithAncestors = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);

  if (!productWithAncestors)
    throw new Error('No product entity types with ancestors found — hierarchy config may be empty');

  const ancestors = hierarchy.getOrderedAncestors(productWithAncestors);
  const ancestorIdKeys = ancestors.map((a) => appConfig.entityIdColumnKeys[a]);

  /** Build ancestor context ID columns with all ancestors set to test values */
  const fullAncestorChannelIds = () => Object.fromEntries(ancestorIdKeys.map((key) => [key, `test-${key}`]));

  it('returns a subject with entityType and generated id', () => {
    const subject = buildSubject(productWithAncestors, fullAncestorChannelIds());
    expect(subject.entityType).toBe(productWithAncestors);
    expect(typeof subject.id).toBe('string');
  });

  it('extracts ancestor context IDs from the input columns', () => {
    const subject = buildSubject(productWithAncestors, fullAncestorChannelIds());
    for (const key of ancestorIdKeys) {
      const ancestor = ancestors[ancestorIdKeys.indexOf(key)];
      expect(subject.channelIds[ancestor]).toBe(`test-${key}`);
    }
  });

  it('allows null ancestor IDs (explicit unscoped)', () => {
    const ancestorChannelIds: Record<string, string | null> = fullAncestorChannelIds();
    for (const key of ancestorIdKeys) ancestorChannelIds[key] = null;
    expect(() => buildSubject(productWithAncestors, ancestorChannelIds)).not.toThrow();
  });

  it('throws MissingScopeError when a required ancestor ID is missing (undefined)', () => {
    const ancestorChannelIds = fullAncestorChannelIds();
    delete ancestorChannelIds[ancestorIdKeys[0]];
    try {
      buildSubject(productWithAncestors, ancestorChannelIds);
      expect.unreachable('Expected MissingScopeError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingScopeError);
      expect((e as MissingScopeError).missingKey).toBe(ancestorIdKeys[0]);
    }
  });
});

/**
 * Single-row enforcement paths (`getValidProductEntity`, `getValidChannelEntity`,
 * `splitByPermission`, the Yjs relay) all build their subject from a resolved DB row. If that
 * row is not carried onto the subject, every row-derived grant evaluates against nothing and
 * fails CLOSED — a silent denial, not an error. That regression is what this pins.
 */
describe('buildSubjectFromEntity — carries the row', () => {
  const product = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);
  if (!product) throw new Error('No product entity types with ancestors found');

  const ancestorIds = Object.fromEntries(
    hierarchy.getOrderedAncestors(product).map((a) => [appConfig.entityIdColumnKeys[a], `test-${a}`]),
  );

  const publicAt = '2026-07-06T12:00:00Z';
  const entity = { ...ancestorIds, id: 'e1', createdBy: 'u1', publicAt, name: 'irrelevant' };

  it('passes the row through, so row-derived rules can evaluate', () => {
    const subject = buildSubjectFromEntity(product, entity);

    expect(subject.row).toBeDefined();
    expect(subject.row?.publicAt).toBe(publicAt);
    expect(subject.createdBy).toBe('u1');
  });

  it('yields a row the built-in rules actually match against', () => {
    const subject = buildSubjectFromEntity(product, entity);
    const row = { ...subject.row, createdBy: subject.createdBy };

    // `own`: the actor created it. Public read: the row carries publicAt.
    expect(rowPredicateMatches(own.predicate, row, { userId: 'u1' })).toBe(true);
    expect(rowPredicateMatches(own.predicate, row, { userId: 'u2' })).toBe(false);
    expect(rowPredicateMatches(publicRow.predicate, row, {})).toBe(true);

    // ...and an unpublished row is not public.
    const unpublished = buildSubjectFromEntity(product, { ...entity, publicAt: null });
    expect(rowPredicateMatches(publicRow.predicate, { ...unpublished.row }, {})).toBe(false);
  });
});
