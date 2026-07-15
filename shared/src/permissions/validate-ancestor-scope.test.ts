import { hierarchy, MissingScopeError, validateAncestorScope } from 'shared';
import { describe, expect, it } from 'vitest';
import type { ChannelScope, SubjectForPermission } from 'shared';

/** Build a raw subject (without validation) for testing validateAncestorScope itself */
const buildRawSubject = (
  entityType: string,
  overrides?: Partial<Record<keyof ChannelScope, string | null | undefined>>,
): SubjectForPermission => {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  const channelIds: Partial<Record<keyof ChannelScope, string | null | undefined>> = {};
  for (const ancestor of ancestors) {
    channelIds[ancestor] = `test-${ancestor}-id`;
  }
  if (overrides) Object.assign(channelIds, overrides);
  return {
    entityType: entityType as SubjectForPermission['entityType'],
    id: 'test-id',
    channelIds: channelIds as ChannelScope,
  };
};

describe('shared validateAncestorScope', () => {
  const productWithAncestors = hierarchy.productTypes.find((t) => hierarchy.getOrderedAncestors(t).length > 0);

  if (!productWithAncestors)
    throw new Error('No product entity types with ancestors found — hierarchy config may be empty');

  const firstAncestor = hierarchy.getOrderedAncestors(productWithAncestors)[0];

  it('passes when all ancestor IDs are present', () => {
    expect(() => validateAncestorScope(buildRawSubject(productWithAncestors))).not.toThrow();
  });

  it('passes when an ancestor ID is explicitly null (intentionally unscoped)', () => {
    expect(() => validateAncestorScope(buildRawSubject(productWithAncestors, { [firstAncestor]: null }))).not.toThrow();
  });

  it('throws MissingScopeError when an ancestor ID is undefined', () => {
    try {
      validateAncestorScope(buildRawSubject(productWithAncestors, { [firstAncestor]: undefined }));
      expect.unreachable('Expected MissingScopeError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingScopeError);
      expect((e as MissingScopeError).missingChannel).toBe(firstAncestor);
    }
  });
});
