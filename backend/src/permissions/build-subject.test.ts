import { buildSubject, buildSubjectFromEntity, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { toClientError } from '#/lib/error';

/** The shared builders refuse an omitted ancestor id; the client reads that refusal as a 400 naming the level. */
describe('a subject built without a required ancestor id', () => {
  const product = hierarchy.productTypes.find((type) => hierarchy.getOrderedAncestors(type).length > 0);
  if (!product) throw new Error('No product entity types with ancestors found');
  const [missingChannel] = hierarchy.getOrderedAncestors(product);

  const clientErrorOf = (build: () => unknown) => {
    try {
      build();
    } catch (error) {
      return toClientError(error);
    }
    throw new Error('expected the subject build to throw');
  };

  it.each([
    ['buildSubject', () => buildSubject(product, {})],
    ['buildSubjectFromEntity', () => buildSubjectFromEntity(product, { id: 'e1' })],
  ])('answers 400 missing_ancestor from %s', (_builder, build) => {
    expect(clientErrorOf(build)).toMatchObject({ status: 400, type: 'missing_ancestor', entityType: product, meta: { missingChannel } });
  });
});
