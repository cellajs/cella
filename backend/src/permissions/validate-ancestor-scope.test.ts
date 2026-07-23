import { hierarchy, type SubjectForPermission } from 'shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { validateAncestorScope } from '#/permissions/validate-ancestor-scope';

/**
 * Engine behavior is covered by the shared twin
 * (shared/src/permissions/validate-ancestor-scope.test.ts). This suite proves only the
 * backend delta: MissingScopeError becomes AppError(400, 'missing_scope').
 */
describe('validateAncestorScope (backend error translation)', () => {
  const product = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);
  if (!product) throw new Error('No product entity types with ancestors found');
  const ancestors = hierarchy.getOrderedAncestors(product);

  const rawSubject = (channelIds: Record<string, string | null | undefined>): SubjectForPermission =>
    ({ entityType: product, channelIds }) as SubjectForPermission;

  it('translates a missing (undefined) ancestor id into AppError(400, missing_scope)', () => {
    try {
      validateAncestorScope(rawSubject({}));
      expect.unreachable('Expected AppError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(400);
      expect((e as AppError).type).toBe('missing_scope');
    }
  });

  it('passes a fully scoped subject through unchanged', () => {
    const channelIds = Object.fromEntries(ancestors.map((a) => [a, `test-${a}-id`]));
    expect(() => validateAncestorScope(rawSubject(channelIds))).not.toThrow();
  });
});
