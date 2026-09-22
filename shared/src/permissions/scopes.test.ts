import { describe, expect, it } from 'vitest';
import { deriveScopes } from './scopes.ts';
import type { PolicyMatrix } from './types.ts';

// Two entity types carry a policy; the vocabulary is derived from them, never listed by hand.
const matrix = { attachment: {}, organization: {} } as unknown as PolicyMatrix;
const scopes = deriveScopes(matrix);

describe('deriveScopes', () => {
  it('derives a read and a write scope per entity type with a policy', () => {
    expect(scopes.all).toEqual(['attachment:read', 'attachment:write', 'organization:read', 'organization:write']);
  });

  it('refuses a matrix without a single policy', () => {
    expect(() => deriveScopes({} as PolicyMatrix)).toThrow();
  });

  it('names read for reads and write for every other action', () => {
    expect(scopes.required('attachment', 'read')).toBe('attachment:read');
    expect(scopes.required('attachment', 'update')).toBe('attachment:write');
    expect(scopes.required('organization', 'delete')).toBe('organization:write');
    expect(scopes.required('organization', 'create')).toBe('organization:write');
  });
});

describe('scopes.allows (the credential mask)', () => {
  it('leaves an unscoped credential untouched', () => {
    expect(scopes.allows(null, 'attachment', 'delete')).toBe(true);
    expect(scopes.allows(undefined, 'organization', 'create')).toBe(true);
  });

  it('fails closed on an empty mask', () => {
    expect(scopes.allows([], 'attachment', 'read')).toBe(false);
  });

  it('write implies read, read never implies write', () => {
    expect(scopes.allows(['attachment:write'], 'attachment', 'read')).toBe(true);
    expect(scopes.allows(['attachment:read'], 'attachment', 'update')).toBe(false);
    expect(scopes.allows(['attachment:read'], 'attachment', 'read')).toBe(true);
  });

  it('never crosses entity types', () => {
    expect(scopes.allows(['organization:write'], 'attachment', 'read')).toBe(false);
  });

  it('fails closed on a scope the vocabulary no longer knows (a renamed entity type)', () => {
    expect(scopes.allows(['label:write' as never], 'attachment', 'read')).toBe(false);
  });
});
