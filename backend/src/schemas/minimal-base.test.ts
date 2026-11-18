import { describe, expect, it } from 'vitest';
import { mockUser } from '#/modules/user/user-mocks';
import { toMinimalBase } from '#/schemas/minimal-base';

describe('toMinimalBase', () => {
  it('keeps the minimal fields of a whole user row and nothing else', () => {
    const user = { ...mockUser(), id: 'user-1', thumbnailUrl: null };

    expect(toMinimalBase('user', user)).toEqual({ id: 'user-1', name: user.name, slug: user.slug, thumbnailUrl: null, entityType: 'user' });
  });
});
