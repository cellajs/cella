import { describe, expect, it } from 'vitest';
import { requestSpanAttributes } from '#/lib/request-span';

// The attribute names a monitor reads from a request span to count usage per organization and the users an error reached.
describe('requestSpanAttributes', () => {
  it('names the tenant, the organization and the user', () => {
    const attributes = requestSpanAttributes({
      tenant: { id: 'tenant-1', name: 'Tenant one', kind: 'live' },
      organization: { id: 'org-1', name: 'Org' },
      user: { id: 'user-1' },
    });
    expect(attributes).toEqual({
      'tenant.id': 'tenant-1',
      'tenant.name': 'Tenant one',
      'tenant.kind': 'live',
      'organization.id': 'org-1',
      'organization.name': 'Org',
      'user.id': 'user-1',
    });
  });

  it('names nothing for a request no guard scoped', () => {
    expect(requestSpanAttributes({})).toEqual({});
  });
});
