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
    expect(activity).toMatchObject({
      resourceType: 'api_key',
      type: 'api_key.created',
      tenantId: 't1',
      userId: 'p-owner',
    });
  });

  it('attributes an api_key revoke to revokedBy, not the key creator', () => {
    const row = { id: 'k1', tenantId: 't1', createdBy: 'p-owner', revokedBy: 'p-admin' };
    const activity = createActivity(metaFor('api_keys'), row, 'update');
    expect(activity).toMatchObject({ type: 'api_key.updated', userId: 'p-admin' });
  });

  it('keeps updatedBy first for service accounts', () => {
    const row = { id: 's1', tenantId: 't1', createdBy: 'p-owner', updatedBy: 'p-editor' };
    const activity = createActivity(metaFor('service_accounts'), row, 'update');
    expect(activity).toMatchObject({ resourceType: 'service_account', userId: 'p-editor', organizationId: null });
  });

  it('logs a system-wide oauth_client without a tenant', () => {
    const row = { id: 'c1', name: 'Portfolio', createdBy: 'p-admin' };
    const activity = createActivity(metaFor('oauth_clients'), row, 'create');
    expect(activity).toMatchObject({ resourceType: 'oauth_client', tenantId: null, userId: 'p-admin' });
  });
});
