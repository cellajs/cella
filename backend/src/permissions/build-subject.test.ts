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

  /** Build a source object with all ancestor IDs set to test values */
  const fullSource = () => Object.fromEntries(ancestorIdKeys.map((key) => [key, `test-${key}`]));

  describe('basic building', () => {
    it('returns a subject with entityType and generated id', () => {
      const subject = buildSubject(productWithAncestors, fullSource());
      expect(subject.entityType).toBe(productWithAncestors);
      expect(subject.id).toBeDefined();
      expect(typeof subject.id).toBe('string');
    });

    it('extracts ancestor context IDs from source', () => {
      const source = fullSource();
      const subject = buildSubject(productWithAncestors, source);
      for (const key of ancestorIdKeys) {
        expect(subject[key as keyof typeof subject]).toBe(`test-${key}`);
      }
    });

    it('uses provided id instead of generating one', () => {
      const subject = buildSubject(productWithAncestors, fullSource(), { id: 'my-entity-id' });
      expect(subject.id).toBe('my-entity-id');
    });

    it('includes createdBy when provided', () => {
      const subject = buildSubject(productWithAncestors, fullSource(), { createdBy: 'user-123' });
      expect(subject.createdBy).toBe('user-123');
    });

    it('includes createdBy null when explicitly provided', () => {
      const subject = buildSubject(productWithAncestors, fullSource(), { createdBy: null });
      expect(subject.createdBy).toBeNull();
    });

    it('omits createdBy when not provided', () => {
      const subject = buildSubject(productWithAncestors, fullSource());
      expect('createdBy' in subject).toBe(false);
    });
  });

  describe('null vs undefined semantics', () => {
    it('allows null ancestor IDs (explicit unscoped)', () => {
      const source: Record<string, string | null> = fullSource();
      // Set all ancestors to null — should pass validation (intentionally unscoped)
      for (const key of ancestorIdKeys) source[key] = null;
      expect(() => buildSubject(productWithAncestors, source)).not.toThrow();
    });

    it('throws 400 when a required ancestor ID is missing (undefined)', () => {
      // Omit the first ancestor ID entirely
      const source = fullSource();
      delete source[ancestorIdKeys[0]];
      try {
        buildSubject(productWithAncestors, source);
        expect.unreachable('Expected AppError to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).type).toBe('missing_scope');
      }
    });
  });

  describe('ignores irrelevant source properties', () => {
    it('does not copy non-ancestor properties from source', () => {
      const source: Partial<ContextEntityIdColumns> = fullSource();
      // Extra properties exist on the runtime object but aren't in ContextEntityIdColumns
      (source as Record<string, string>).tenantId = 'should-not-appear';
      (source as Record<string, string>).randomProp = 'nope';
      const subject = buildSubject(productWithAncestors, source);
      expect('tenantId' in subject).toBe(false);
      expect('randomProp' in subject).toBe(false);
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
      const source: Record<string, string> = {};
      for (const ancestor of typeAncestors) {
        source[appConfig.entityIdColumnKeys[ancestor]] = `test-${ancestor}-id`;
      }
      const subject = buildSubject(entityType, source);
      expect(subject.entityType).toBe(entityType);
      for (const ancestor of typeAncestors) {
        const key = appConfig.entityIdColumnKeys[ancestor];
        expect(subject[key as keyof typeof subject]).toBe(`test-${ancestor}-id`);
      }
    });
  }

  // Test every context entity type with ancestors
  for (const entityType of hierarchy.contextTypes) {
    const typeAncestors = hierarchy.getOrderedAncestors(entityType);
    if (typeAncestors.length === 0) continue;

    it(`builds a valid subject for context type "${entityType}" (ancestors: ${typeAncestors.join(' → ')})`, () => {
      const source: Record<string, string> = {};
      for (const ancestor of typeAncestors) {
        source[appConfig.entityIdColumnKeys[ancestor]] = `test-${ancestor}-id`;
      }
      const subject = buildSubject(entityType, source);
      expect(subject.entityType).toBe(entityType);
    });
  }
});
