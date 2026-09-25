import { describe, expect, it } from 'vitest';
import { type AccessContext, accessFrom, actorFrom } from '#/permissions/access';

const bindings = [{ channelType: 'organization', channelId: 'org1', organizationId: 'org1', role: 'admin' }];
const scoped = { var: { actor: { id: 'svc-1', bindings, scopes: ['attachment:write'] }, isSystemAdmin: false } };
const session = { var: { actor: { id: 'user-1', bindings, scopes: null }, isSystemAdmin: false } };
const noActor = { var: {} };
const as = (ctx: unknown) => ctx as AccessContext;

describe('accessFrom', () => {
  it('carries the key or token mask with the actor and its grants', () => {
    expect(accessFrom(as(scoped))).toEqual({
      actorId: 'svc-1',
      isSystemAdmin: false,
      memberships: bindings,
      scopes: ['attachment:write'],
    });
    expect(accessFrom(as(session))).toMatchObject({ actorId: 'user-1', scopes: null });
  });

  it('drops only the mask when unmasked: same actor, same grants', () => {
    expect(accessFrom(as(scoped), { unmasked: true })).toEqual({
      actorId: 'svc-1',
      isSystemAdmin: false,
      memberships: bindings,
      scopes: null,
    });
  });

  it('is anonymous without an actor, unmasked or not', () => {
    expect(accessFrom(as(noActor))).toEqual({ anonymous: true });
    expect(accessFrom(as(noActor), { unmasked: true })).toEqual({ anonymous: true });
  });
});

describe('actorFrom', () => {
  it('keeps the mask on the predicate actor', () => {
    expect(actorFrom(as(scoped))).toEqual({ actorId: 'svc-1', isSystemAdmin: false, scopes: ['attachment:write'] });
    expect(actorFrom(as(noActor))).toEqual({ anonymous: true });
  });
});
