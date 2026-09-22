import { describe, expect, it } from 'vitest';
import { deriveAccessScopes } from './access-scopes.ts';
import type { PolicyMatrix } from './types.ts';

// Two entity types carry a policy; the vocabulary is derived from them, never listed by hand.
const matrix = { attachment: {}, organization: {} } as unknown as PolicyMatrix;
const accessScopes = deriveAccessScopes(matrix);

describe('deriveAccessScopes', () => {
  it('derives a read and a write scope per entity type with a policy', () => {
    expect(accessScopes.all).toEqual([
      'attachment:read',
      'attachment:write',
      'organization:read',
      'organization:write',
    ]);
  });

  it('derives nothing from a configuration without a single policy', () => {
    expect(deriveAccessScopes({} as PolicyMatrix).all).toEqual([]);
  });

  it('names read for reads and write for every other action', () => {
    expect(accessScopes.required('attachment', 'read')).toBe('attachment:read');
    expect(accessScopes.required('attachment', 'update')).toBe('attachment:write');
    expect(accessScopes.required('organization', 'delete')).toBe('organization:write');
    expect(accessScopes.required('organization', 'create')).toBe('organization:write');
  });
});

describe('accessScopes.allows (the credential mask)', () => {
  it('leaves an unscoped credential untouched', () => {
    expect(accessScopes.allows(null, 'attachment', 'delete')).toBe(true);
    expect(accessScopes.allows(undefined, 'organization', 'create')).toBe(true);
  });

  it('fails closed on an empty mask', () => {
    expect(accessScopes.allows([], 'attachment', 'read')).toBe(false);
  });

  it('write implies read, read never implies write', () => {
    expect(accessScopes.allows(['attachment:write'], 'attachment', 'read')).toBe(true);
    expect(accessScopes.allows(['attachment:read'], 'attachment', 'update')).toBe(false);
    expect(accessScopes.allows(['attachment:read'], 'attachment', 'read')).toBe(true);
  });

  it('never crosses entity types', () => {
    expect(accessScopes.allows(['organization:write'], 'attachment', 'read')).toBe(false);
  });

  it('fails closed on a scope the vocabulary no longer knows (a renamed entity type)', () => {
    expect(accessScopes.allows(['label:write' as never], 'attachment', 'read')).toBe(false);
  });
});
