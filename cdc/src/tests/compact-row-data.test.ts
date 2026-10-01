import { describe, expect, it } from 'vitest';
import { parseMessage } from '../pipeline/parse-message';
import { dmlMessage } from './factories';

const apiKey = { id: 'k1', tenant_id: 't1', created_by: 'p-owner', name: 'ci', prefix: 'app_sk_live_ab', last4: '1234', hash: 'sha256-of-the-key' };
const apiKeyOnTheWire = { id: 'k1', tenantId: 't1', createdBy: 'p-owner', name: 'ci', prefix: 'app_sk_live_ab', last4: '1234' };

// The handlers compact every row image they emit, so a column in `secretColumns` (backend/src/db/secret-columns.ts)
// never reaches the backend or the worker's log.
describe('parseMessage strips secret columns from the row images the handlers emit', () => {
  it('an api_key update carries the hash in neither image, and keeps the other columns', () => {
    const result = parseMessage(dmlMessage('update', 'api_keys', { ...apiKey, name: 'ci renamed' }, apiKey));

    expect(result?.rowData).toEqual({ ...apiKeyOnTheWire, name: 'ci renamed' });
    expect(result?.oldRowData).toEqual(apiKeyOnTheWire);
  });

  it('an oauth_client insert and an api_key delete drop the secret column', () => {
    const insert = parseMessage(dmlMessage('insert', 'oauth_clients', { id: 'c1', name: 'Portfolio', created_by: 'p-admin', secret_hash: 'sha256' }));
    expect(insert?.rowData).toEqual({ id: 'c1', name: 'Portfolio', createdBy: 'p-admin' });

    const deletion = parseMessage(dmlMessage('delete', 'api_keys', apiKey));
    expect(deletion?.rowData).toEqual(apiKeyOnTheWire);
  });

  it('keeps a column named like a secret on a table that declares none', () => {
    const row = { id: 'm1', organization_id: 'org-1', role: 'admin', hash: 'not a secret column here' };
    const result = parseMessage(dmlMessage('insert', 'memberships', row));
    expect(result?.rowData).toEqual({ id: 'm1', organizationId: 'org-1', role: 'admin', hash: 'not a secret column here' });
  });
});
