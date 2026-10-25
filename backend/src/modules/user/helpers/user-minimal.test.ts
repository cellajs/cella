import { describe, expect, it } from 'vitest';
import { toUserMinimalBase } from '#/modules/user/helpers/user-minimal';
import { mockUser } from '#/modules/user/user-mocks';

describe('toUserMinimalBase', () => {
  it('keeps the minimal fields of a whole user row and nothing else', () => {
    const user = { ...mockUser(), id: 'user-1', thumbnailUrl: null };

    expect(toUserMinimalBase(user)).toEqual({ id: 'user-1', name: user.name, slug: user.slug, thumbnailUrl: null, entityType: 'user' });
  });
});
