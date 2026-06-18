import { appConfig, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { buildSubject } from '#/permissions/build-subject';
import type { ContextEntityIdColumns } from '#/permissions/permission-manager/types';

describe('buildSubject', () => {
  // Use the first product type with ancestors for most tests (e.g., attachment → project → organization)
  const productWithAncestors = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);

  if (!productWithAncestors)
    throw new Error('No product entity types with ancestors found — hierarchy config may be empty');

  const ancestors = hierarchy.getOrderedAncestors(productWithAncestors);
  const ancestorIdKeys = ancestors.map((a) => appConfig.entityIdColumnKeys[a]);

  /** Build ancestor context ID columns with all ancestors set to test values */
  const fullAncestorContextIds = () => Object.fromEntries(ancestorIdKeys.map((key) => [key, `test-${key}`]));

  describe('basic building', () => {
    it('returns a subject with entityType and generated id', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorContextIds());
      expect(subject.entityType).toBe(productWithAncestors);
      expect(subject.id).toBeDefined();
      expect(typeof subject.id).toBe('string');
    });

    it('extracts ancestor context IDs from the input columns', () => {
      const ancestorContextIds = fullAncestorContextIds();
      const subject = buildSubject(productWithAncestors, ancestorContextIds);
      for (const key of ancestorIdKeys) {
        const ancestor = ancestors[ancestorIdKeys.indexOf(key)];
        expect(subject.contextIds[ancestor]).toBe(`test-${key}`);
      }
    });

    it('uses provided id instead of generating one', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorContextIds(), { id: 'my-entity-id' });
      expect(subject.id).toBe('my-entity-id');
    });

    it('includes createdBy when provided', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorContextIds(), { createdBy: 'user-123' });
      expect(subject.createdBy).toBe('user-123');
    });

    it('includes createdBy null when explicitly provided', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorContextIds(), { createdBy: null });
      expect(subject.createdBy).toBeNull();
    });

    it('omits createdBy when not provided', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorContextIds());
      expect('createdBy' in subject).toBe(false);
    });
  });

  describe('null vs undefined semantics', () => {
    it('allows null ancestor IDs (explicit unscoped)', () => {
      const ancestorContextIds: Record<string, string | null> = fullAncestorContextIds();
      // Set all ancestors to null — should pass validation (intentionally unscoped)
      for (const key of ancestorIdKeys) ancestorContextIds[key] = null;
      expect(() => buildSubject(productWithAncestors, ancestorContextIds)).not.toThrow();
    });

    it('throws 400 when a required ancestor ID is missing (undefined)', () => {
      // Omit the first ancestor ID entirely
      const ancestorContextIds = fullAncestorContextIds();
      delete ancestorContextIds[ancestorIdKeys[0]];
      try {
        buildSubject(productWithAncestors, ancestorContextIds);
        expect.unreachable('Expected AppError to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).type).toBe('missing_scope');
      }
    });
  });

  describe('ignores irrelevant input properties', () => {
    it('does not copy non-ancestor properties from input columns', () => {
      const ancestorContextIds: Partial<ContextEntityIdColumns> = fullAncestorContextIds();
      // Extra properties exist on the runtime object but aren't in ContextEntityIdColumns
      (ancestorContextIds as Record<string, string>).tenantId = 'should-not-appear';
      (ancestorContextIds as Record<string, string>).randomProp = 'nope';
      const subject = buildSubject(productWithAncestors, ancestorContextIds);
      expect('tenantId' in subject.contextIds).toBe(false);
      expect('randomProp' in subject.contextIds).toBe(false);
    });
  });

  describe('entity types without ancestors', () => {
    const rootContext = hierarchy.contextTypes.find((t) => hierarchy.getOrderedAncestors(t).length === 0);

    if (rootContext) {
      it(`builds subject for root context type "${rootContext}" without any ancestor IDs`, () => {
        const subject = buildSubject(rootContext, {});
        expect(subject.entityType).toBe(rootContext);
        expect(subject.id).toBeDefined();
      });
    }
  });

  // Test every product entity type to ensure the builder works for all hierarchy configurations
  for (const entityType of hierarchy.productTypes) {
    const typeAncestors = hierarchy.getOrderedAncestors(entityType);
    if (typeAncestors.length === 0) continue;

    it(`builds a valid subject for "${entityType}" (ancestors: ${typeAncestors.join(' → ')})`, () => {
      const ancestorContextIds: Record<string, string> = {};
      for (const ancestor of typeAncestors) {
        ancestorContextIds[appConfig.entityIdColumnKeys[ancestor]] = `test-${ancestor}-id`;
      }
      const subject = buildSubject(entityType, ancestorContextIds);
      expect(subject.entityType).toBe(entityType);
      for (const ancestor of typeAncestors) {
        expect(subject.contextIds[ancestor]).toBe(`test-${ancestor}-id`);
      }
    });
  }

  // Test every context entity type with ancestors
  for (const entityType of hierarchy.contextTypes) {
    const typeAncestors = hierarchy.getOrderedAncestors(entityType);
    if (typeAncestors.length === 0) continue;

    it(`builds a valid subject for context type "${entityType}" (ancestors: ${typeAncestors.join(' → ')})`, () => {
      const ancestorContextIds: Record<string, string> = {};
      for (const ancestor of typeAncestors) {
        ancestorContextIds[appConfig.entityIdColumnKeys[ancestor]] = `test-${ancestor}-id`;
      }
      const subject = buildSubject(entityType, ancestorContextIds);
      expect(subject.entityType).toBe(entityType);
    });
  }
});
