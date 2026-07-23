import { appConfig, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '#/core/error';
import { buildSubject, buildSubjectFromEntity } from '#/permissions/build-subject';

/**
 * Engine behavior is covered by the shared twin (shared/src/permissions/build-subject.test.ts).
 * This suite proves only the backend delta: MissingScopeError becomes AppError(400,
 * 'missing_scope') with the scope metadata preserved.
 */
describe('buildSubject (backend error translation)', () => {
  const product = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);
  if (!product) throw new Error('No product entity types with ancestors found');
  const ancestors = hierarchy.getOrderedAncestors(product);

  const expectMissingScope = (fn: () => void) => {
    try {
      fn();
      expect.unreachable('Expected AppError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(400);
      expect((e as AppError).type).toBe('missing_scope');
      expect((e as AppError).meta?.missingChannel).toBe(ancestors[0]);
    }
  };

  it('translates a missing ancestor id into AppError(400, missing_scope)', () => {
    expectMissingScope(() => buildSubject(product, {}));
  });

  it('buildSubjectFromEntity translates through the same path', () => {
    expectMissingScope(() => buildSubjectFromEntity(product, { id: 'e1' }));
  });

  it('passes valid input through to the shared engine unchanged', () => {
    const channelIds = Object.fromEntries(ancestors.map((a) => [appConfig.entityIdColumnKeys[a], `test-${a}-id`]));
    const subject = buildSubject(product, channelIds);
    expect(subject.entityType).toBe(product);
    for (const a of ancestors) expect(subject.channelIds[a]).toBe(`test-${a}-id`);
  });
});
