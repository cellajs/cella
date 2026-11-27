import { describe, expect, it } from 'vitest';
import { createActivity } from '../services/create-activity';
import { tableRegistry } from '../table-registry';
import type { TableMeta } from '../types';

const metaFor = (tableName: string): TableMeta => {
  const meta = tableRegistry.get(tableName);
  if (!meta) throw new Error(`${tableName} is not a tracked table`);
  return meta;
};

describe('createActivity actor', () => {
  it('attributes an api_key create to createdBy', () => {
    const row = { id: 'k1', tenantId: 't1', createdBy: 'p-owner', revokedBy: null };
    const activity = createActivity(metaFor('api_keys'), row, 'create');
    expect(activity).toMatchObject({ resourceType: 'api_key', type: 'api_key.created', tenantId: 't1', actorId: 'p-owner' });
  });

  it('attributes an api_key revoke to revokedBy, not the key creator', () => {
    const row = { id: 'k1', tenantId: 't1', createdBy: 'p-owner', revokedBy: 'p-admin' };
    const activity = createActivity(metaFor('api_keys'), row, 'update');
    expect(activity).toMatchObject({ type: 'api_key.updated', actorId: 'p-admin' });
  });

  it('keeps updatedBy first for service accounts', () => {
    const row = { id: 's1', tenantId: 't1', createdBy: 'p-owner', updatedBy: 'p-editor' };
    const activity = createActivity(metaFor('service_accounts'), row, 'update');
    expect(activity).toMatchObject({ resourceType: 'service_account', actorId: 'p-editor', organizationId: null });
  });

  it('names no actor for a server-driven update, not the row creator', () => {
    const row = { id: 's1', tenantId: 't1', createdBy: 'p-owner', updatedAt: '2026-11-27T10:00:00.000Z', updatedBy: null };
    const activity = createActivity(metaFor('service_accounts'), row, 'update');
    // Naming the creator makes the server's write an own echo to the creator's tab whose stx the row still holds.
    expect(activity.actorId).toBeNull();
  });

  it('names no actor for a hard delete, not the last writer', () => {
    const row = { id: 'm1', tenantId: 't1', organizationId: 'o1', userId: 'u1', createdBy: 'p-admin', updatedBy: 'p-editor' };
    expect(createActivity(metaFor('memberships'), row, 'delete').actorId).toBeNull();
  });

  it('logs a system-wide oauth_client without a tenant', () => {
    const row = { id: 'c1', name: 'Portfolio', createdBy: 'p-admin' };
    const activity = createActivity(metaFor('oauth_clients'), row, 'create');
    expect(activity).toMatchObject({ resourceType: 'oauth_client', tenantId: null, actorId: 'p-admin' });
  });
});

describe('createActivity channel ids', () => {
  it('gives a membership activity the organization its row holds', () => {
    const row = { id: 'm1', tenantId: 't1', channelType: 'organization', channelId: 'o1', organizationId: 'o1', userId: 'u1', role: 'member' };
    const activity = createActivity(metaFor('memberships'), row, 'create');

    // Without it the organization's membership signal never moves and the API has no stream to route the event to.
    expect(activity).toMatchObject({ resourceType: 'membership', type: 'membership.created', organizationId: 'o1' });
  });

  it('gives a deleted membership its organization too, from the old row', () => {
    const row = { id: 'm1', tenantId: 't1', channelType: 'organization', channelId: 'o1', organizationId: 'o1', userId: 'u1', role: 'member' };

    expect(createActivity(metaFor('memberships'), row, 'delete')).toMatchObject({ type: 'membership.deleted', organizationId: 'o1' });
  });

  it('leaves the organization empty for a resource row that holds none', () => {
    const activity = createActivity(metaFor('tenants'), { id: 't1', name: 'Tenant' }, 'create');

    expect(activity.organizationId).toBeNull();
  });
});
