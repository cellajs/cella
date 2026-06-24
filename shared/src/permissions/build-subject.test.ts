import { appConfig, buildSubject, hierarchy, MissingScopeError } from 'shared';
import { describe, expect, it } from 'vitest';

describe('shared buildSubject', () => {
  // Use the first product type with ancestors (e.g., attachment → organization)
  const productWithAncestors = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);

  if (!productWithAncestors)
    throw new Error('No product entity types with ancestors found — hierarchy config may be empty');

  const ancestors = hierarchy.getOrderedAncestors(productWithAncestors);
  const ancestorIdKeys = ancestors.map((a) => appConfig.entityIdColumnKeys[a]);

  /** Build ancestor context ID columns with all ancestors set to test values */
  const fullAncestorContextIds = () => Object.fromEntries(ancestorIdKeys.map((key) => [key, `test-${key}`]));

  it('returns a subject with entityType and generated id', () => {
    const subject = buildSubject(productWithAncestors, fullAncestorContextIds());
    expect(subject.entityType).toBe(productWithAncestors);
    expect(typeof subject.id).toBe('string');
  });

  it('extracts ancestor context IDs from the input columns', () => {
    const subject = buildSubject(productWithAncestors, fullAncestorContextIds());
    for (const key of ancestorIdKeys) {
      const ancestor = ancestors[ancestorIdKeys.indexOf(key)];
      expect(subject.contextIds[ancestor]).toBe(`test-${key}`);
    }
  });

  it('allows null ancestor IDs (explicit unscoped)', () => {
    const ancestorContextIds: Record<string, string | null> = fullAncestorContextIds();
    for (const key of ancestorIdKeys) ancestorContextIds[key] = null;
    expect(() => buildSubject(productWithAncestors, ancestorContextIds)).not.toThrow();
  });

  it('throws MissingScopeError when a required ancestor ID is missing (undefined)', () => {
    const ancestorContextIds = fullAncestorContextIds();
    delete ancestorContextIds[ancestorIdKeys[0]];
    try {
      buildSubject(productWithAncestors, ancestorContextIds);
      expect.unreachable('Expected MissingScopeError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingScopeError);
      expect((e as MissingScopeError).missingKey).toBe(ancestorIdKeys[0]);
    }
  });
});
