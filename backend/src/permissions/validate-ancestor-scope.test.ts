import { type AncestorChannelIds, appConfig, hierarchy, type SubjectForPermission } from 'shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

/** Assert that a function throws an AppError with the given type */
const expectAppError = (fn: () => void, type: string) => {
  try {
    fn();
    expect.unreachable('Expected AppError to be thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).type).toBe(type);
  }
};

/** Build a raw subject (without validation) for testing validateAncestorScope itself */
const buildRawSubject = (
  entityType: SubjectForPermission['entityType'],
  overrides?: Partial<Record<keyof AncestorChannelIds, string | null | undefined>>,
): SubjectForPermission => {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  const channelIds: Partial<Record<keyof AncestorChannelIds, string | null | undefined>> = {};
  for (const ancestor of ancestors) {
    channelIds[ancestor] = `test-${ancestor}-id`;
  }
  if (overrides) Object.assign(channelIds, overrides);
  const subject: SubjectForPermission = {
    entityType,
    channelIds: channelIds as AncestorChannelIds,
  };
  return subject;
};

describe('validateAncestorScope', () => {
  it('passes for organization (root context, no ancestors)', () => {
    expect(() => validateAncestorScope(buildRawSubject('organization'))).not.toThrow();
  });

  // Test every product entity type from the hierarchy
  for (const entityType of hierarchy.productTypes) {
    const ancestors = hierarchy.getOrderedAncestors(entityType);
    if (ancestors.length === 0) continue; // parentless products (e.g., page) have no ancestors to validate

    describe(`${entityType} (ancestors: ${ancestors.join(' → ')})`, () => {
      it('passes when all ancestor context IDs are provided', () => {
        expect(() => validateAncestorScope(buildRawSubject(entityType))).not.toThrow();
      });

      // Test each ancestor: null is allowed (explicit), undefined throws
      for (const ancestor of ancestors) {
        const idKey = appConfig.entityIdColumnKeys[ancestor];

        it(`passes when ${idKey} is explicitly null`, () => {
          expect(() => validateAncestorScope(buildRawSubject(entityType, { [ancestor]: null }))).not.toThrow();
        });

        it(`throws when ${idKey} is undefined (missing)`, () => {
          expectAppError(
            () => validateAncestorScope(buildRawSubject(entityType, { [ancestor]: undefined })),
            'missing_scope',
          );
        });
      }
    });
  }

  // Test every channel entity type that has ancestors (e.g., project → organization)
  for (const entityType of hierarchy.channelTypes) {
    const ancestors = hierarchy.getOrderedAncestors(entityType);
    if (ancestors.length === 0) continue; // root contexts (organization) are tested above

    describe(`${entityType} context (ancestors: ${ancestors.join(' → ')})`, () => {
      it('passes when all ancestor context IDs are provided', () => {
        expect(() => validateAncestorScope(buildRawSubject(entityType))).not.toThrow();
      });

      for (const ancestor of ancestors) {
        const idKey = appConfig.entityIdColumnKeys[ancestor];

        it(`throws when ${idKey} is undefined (missing)`, () => {
          expectAppError(
            () => validateAncestorScope(buildRawSubject(entityType, { [ancestor]: undefined })),
            'missing_scope',
          );
        });
      }
    });
  }
});

// Only meaningful when a product entity has ≥2 ancestors (e.g. attachment → project → organization).
// Cella's default hierarchy has at most 1 ancestor, so this suite registers no tests there.
const deepProduct = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length >= 2);

if (deepProduct) {
  describe('insufficient scope prevents permission bypass', () => {
    const ancestors = hierarchy.getOrderedAncestors(deepProduct);
    const mostSpecificAncestor = ancestors[0];
    const idKey = appConfig.entityIdColumnKeys[mostSpecificAncestor];

    it(`cannot bypass ${mostSpecificAncestor} scope for ${deepProduct} by omitting ${idKey}`, () => {
      expectAppError(
        () => validateAncestorScope(buildRawSubject(deepProduct, { [mostSpecificAncestor]: undefined })),
        'missing_scope',
      );
    });

    it(`explicitly null ${idKey} is allowed for ${deepProduct} (org-level scope)`, () => {
      expect(() => validateAncestorScope(buildRawSubject(deepProduct, { [mostSpecificAncestor]: null }))).not.toThrow();
    });
  });
}
