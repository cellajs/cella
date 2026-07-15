import { appConfig, type ChannelEntityIdColumns, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { buildSubject } from '#/permissions/build-subject';

describe('buildSubject', () => {
  // Use the first product type with ancestors for most tests (e.g., attachment → project → organization)
  const productWithAncestors = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);

  if (!productWithAncestors)
    throw new Error('No product entity types with ancestors found — hierarchy config may be empty');

  const ancestors = hierarchy.getOrderedAncestors(productWithAncestors);
  const ancestorIdKeys = ancestors.map((a) => appConfig.entityIdColumnKeys[a]);

  /** Build ancestor context ID columns with all ancestors set to test values */
  const fullAncestorChannelIds = () => Object.fromEntries(ancestorIdKeys.map((key) => [key, `test-${key}`]));

  describe('basic building', () => {
    it('returns a subject with entityType and generated id', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorChannelIds());
      expect(subject.entityType).toBe(productWithAncestors);
      expect(subject.id).toBeDefined();
      expect(typeof subject.id).toBe('string');
    });

    it('extracts ancestor context IDs from the input columns', () => {
      const ancestorChannelIds = fullAncestorChannelIds();
      const subject = buildSubject(productWithAncestors, ancestorChannelIds);
      for (const key of ancestorIdKeys) {
        const ancestor = ancestors[ancestorIdKeys.indexOf(key)];
        expect(subject.channelIds[ancestor]).toBe(`test-${key}`);
      }
    });

    it('uses provided id instead of generating one', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorChannelIds(), { id: 'my-entity-id' });
      expect(subject.id).toBe('my-entity-id');
    });

    it('includes createdBy when provided', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorChannelIds(), { createdBy: 'user-123' });
      expect(subject.createdBy).toBe('user-123');
    });

    it('includes createdBy null when explicitly provided', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorChannelIds(), { createdBy: null });
      expect(subject.createdBy).toBeNull();
    });

    it('omits createdBy when not provided', () => {
      const subject = buildSubject(productWithAncestors, fullAncestorChannelIds());
      expect('createdBy' in subject).toBe(false);
    });
  });

  describe('null vs undefined semantics', () => {
    it('allows null ancestor IDs (explicit unscoped)', () => {
      const ancestorChannelIds: Record<string, string | null> = fullAncestorChannelIds();
      // Null ancestors are intentionally unscoped and pass validation.
      for (const key of ancestorIdKeys) ancestorChannelIds[key] = null;
      expect(() => buildSubject(productWithAncestors, ancestorChannelIds)).not.toThrow();
    });

    it('throws 400 when a required ancestor ID is missing (undefined)', () => {
      // Omit the first ancestor ID entirely
      const ancestorChannelIds = fullAncestorChannelIds();
      delete ancestorChannelIds[ancestorIdKeys[0]];
      try {
        buildSubject(productWithAncestors, ancestorChannelIds);
        expect.unreachable('Expected AppError to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).type).toBe('missing_scope');
      }
    });
  });

  describe('ignores irrelevant input properties', () => {
    it('does not copy non-ancestor properties from input columns', () => {
      const ancestorChannelIds: Partial<ChannelEntityIdColumns> = fullAncestorChannelIds();
      // Extra properties exist on the runtime object but aren't in ChannelEntityIdColumns
      (ancestorChannelIds as Record<string, string>).tenantId = 'should-not-appear';
      (ancestorChannelIds as Record<string, string>).randomProp = 'nope';
      const subject = buildSubject(productWithAncestors, ancestorChannelIds);
      expect('tenantId' in subject.channelIds).toBe(false);
      expect('randomProp' in subject.channelIds).toBe(false);
    });
  });

  describe('entity types without ancestors', () => {
    const rootChannel = hierarchy.channelTypes.find((t) => hierarchy.getOrderedAncestors(t).length === 0);

    if (rootChannel) {
      it(`builds subject for root channel type "${rootChannel}" without any ancestor IDs`, () => {
        const subject = buildSubject(rootChannel, {});
        expect(subject.entityType).toBe(rootChannel);
        expect(subject.id).toBeDefined();
      });
    }
  });

  // Test every product entity type to ensure the builder works for all hierarchy configurations
  for (const entityType of hierarchy.productTypes) {
    const typeAncestors = hierarchy.getOrderedAncestors(entityType);
    if (typeAncestors.length === 0) continue;

    it(`builds a valid subject for "${entityType}" (ancestors: ${typeAncestors.join(' → ')})`, () => {
      const ancestorChannelIds: Record<string, string> = {};
      for (const ancestor of typeAncestors) {
        ancestorChannelIds[appConfig.entityIdColumnKeys[ancestor]] = `test-${ancestor}-id`;
      }
      const subject = buildSubject(entityType, ancestorChannelIds);
      expect(subject.entityType).toBe(entityType);
      for (const ancestor of typeAncestors) {
        expect(subject.channelIds[ancestor]).toBe(`test-${ancestor}-id`);
      }
    });
  }

  // Test every channel entity type with ancestors
  for (const entityType of hierarchy.channelTypes) {
    const typeAncestors = hierarchy.getOrderedAncestors(entityType);
    if (typeAncestors.length === 0) continue;

    it(`builds a valid subject for channel type "${entityType}" (ancestors: ${typeAncestors.join(' → ')})`, () => {
      const ancestorChannelIds: Record<string, string> = {};
      for (const ancestor of typeAncestors) {
        ancestorChannelIds[appConfig.entityIdColumnKeys[ancestor]] = `test-${ancestor}-id`;
      }
      const subject = buildSubject(entityType, ancestorChannelIds);
      expect(subject.entityType).toBe(entityType);
    });
  }
});
