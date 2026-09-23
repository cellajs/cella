import { describe, expect, it } from 'vitest';
import { tableRegistry } from '../table-registry';
import type { CdcRowData, TableMeta } from '../types';
import { compactRowData } from '../utils/compact-row-data';

const metaFor = (tableName: string): TableMeta => {
  const meta = tableRegistry.get(tableName);
  if (!meta) throw new Error(`${tableName} is not a tracked table`);
  return meta;
};

describe('compactRowData', () => {
  it('strips the api_key hash and keeps the rest', () => {
    const row = { id: 'k1', prefix: 'app_sk_live_ab', last4: '1234', hash: 'sha256' } as unknown as CdcRowData;
    expect(compactRowData(metaFor('api_keys'), row)).toEqual({ id: 'k1', prefix: 'app_sk_live_ab', last4: '1234' });
  });

  it('strips the oauth_client secret hash', () => {
    const row = { id: 'c1', name: 'Portfolio', secretHash: 'sha256' } as unknown as CdcRowData;
    expect(compactRowData(metaFor('oauth_clients'), row)).toEqual({ id: 'c1', name: 'Portfolio' });
  });

  it('leaves a table without secret columns untouched', () => {
    const row = { id: 'm1', role: 'admin', hash: 'not a secret column here' } as unknown as CdcRowData;
    expect(compactRowData(metaFor('memberships'), row)).toEqual(row);
  });
});
