import { describe, it, expect } from 'vitest';
import { snakeToCamel } from '../utils/snake-to-camel';
import { convertRowKeys } from '../utils/convert-row-keys';
import { getChangedKeys } from '../utils/get-changed-keys';
import { extractRowData } from '../utils/extract-row-data';
import { extractStxData } from '../utils/extract-stx-data';
import { actionToVerb } from '../utils/action-to-verb';

describe('snakeToCamel', () => {
  it('should convert snake_case to camelCase', () => {
    expect(snakeToCamel('hello_world')).toBe('helloWorld');
    expect(snakeToCamel('user_id')).toBe('userId');
    expect(snakeToCamel('organization_id')).toBe('organizationId');
  });

  it('should handle single words', () => {
    expect(snakeToCamel('hello')).toBe('hello');
    expect(snakeToCamel('id')).toBe('id');
  });

  it('should handle multiple underscores', () => {
    expect(snakeToCamel('created_by_user_id')).toBe('createdByUserId');
  });

  it('should handle empty string', () => {
    expect(snakeToCamel('')).toBe('');
  });

  it('should not change already camelCase strings', () => {
    expect(snakeToCamel('helloWorld')).toBe('helloWorld');
    expect(snakeToCamel('userId')).toBe('userId');
  });
});

describe('convertRowKeys', () => {
  it('should convert all keys from snake_case to camelCase', () => {
    const row = { user_id: '123', organization_id: '456', created_at: '2024-01-01' };
    const result = convertRowKeys(row);
    expect(result).toEqual({ userId: '123', organizationId: '456', createdAt: '2024-01-01' });
  });

  it('should handle empty object', () => {
    expect(convertRowKeys({})).toEqual({});
  });

  it('should preserve values', () => {
    const row = { id: '123', count: 42, is_active: true, data: null };
    const result = convertRowKeys(row);
    expect(result).toEqual({ id: '123', count: 42, isActive: true, data: null });
  });
});

describe('getChangedKeys', () => {
  it('should detect changed keys between old and new rows', () => {
    const oldRow = { id: '1', name: 'old', email: 'a@b.com' };
    const newRow = { id: '1', name: 'new', email: 'a@b.com' };
    expect(getChangedKeys(oldRow, newRow)).toEqual(['name']);
  });

  it('should return empty array when no changes', () => {
    const row = { id: '1', name: 'same' };
    expect(getChangedKeys(row, row)).toEqual([]);
  });

  it('should skip modifiedAt column', () => {
    const oldRow = { id: '1', name: 'old', modifiedAt: '2024-01-01' };
    const newRow = { id: '1', name: 'old', modifiedAt: '2024-01-02' };
    expect(getChangedKeys(oldRow, newRow)).toEqual([]);
  });

  it('should detect changes in nested objects via JSON comparison', () => {
    const oldRow = { id: '1', data: { a: 1 } };
    const newRow = { id: '1', data: { a: 2 } };
    expect(getChangedKeys(oldRow, newRow)).toEqual(['data']);
  });

  it('should return keys already in camelCase', () => {
    const oldRow = { userId: '1', organizationId: 'old' };
    const newRow = { userId: '1', organizationId: 'new' };
    expect(getChangedKeys(oldRow, newRow)).toEqual(['organizationId']);
  });

  it('should detect multiple changed keys', () => {
    const oldRow = { id: '1', name: 'old', email: 'old@b.com', status: 'active' };
    const newRow = { id: '1', name: 'new', email: 'new@b.com', status: 'active' };
    expect(getChangedKeys(oldRow, newRow)).toEqual(['name', 'email']);
  });
});

describe('extractRowData', () => {
  it('should return object rows directly', () => {
    const row = { id: '1', name: 'test' };
    expect(extractRowData(row)).toEqual({ id: '1', name: 'test' });
  });

  it('should return empty object for null/undefined', () => {
    expect(extractRowData(null as any)).toEqual({});
    expect(extractRowData(undefined as any)).toEqual({});
  });

  it('should handle array format (legacy fallback)', () => {
    const row = [
      { name: 'id', value: '1' },
      { name: 'name', value: 'test' },
    ];
    expect(extractRowData(row as any)).toEqual({ id: '1', name: 'test' });
  });
});

describe('extractStxData', () => {
  it('should extract valid stx data', () => {
    const row = {
      stx: { mutationId: 'mut-1', sourceId: 'src-1', version: 1, fieldVersions: { name: 1 } },
    };
    expect(extractStxData(row)).toEqual({
      mutationId: 'mut-1',
      sourceId: 'src-1',
      version: 1,
      fieldVersions: { name: 1 },
    });
  });

  it('should return null when stx is not present', () => {
    expect(extractStxData({})).toBeNull();
    expect(extractStxData({ stx: null })).toBeNull();
    expect(extractStxData({ stx: undefined })).toBeNull();
  });

  it('should return null for invalid stx format', () => {
    expect(extractStxData({ stx: 'not-an-object' })).toBeNull();
    expect(extractStxData({ stx: [1, 2, 3] })).toBeNull();
    expect(extractStxData({ stx: { mutationId: 123 } })).toBeNull();
  });

  it('should default fieldVersions to empty object', () => {
    const row = {
      stx: { mutationId: 'mut-1', sourceId: 'src-1', version: 1 },
    };
    const result = extractStxData(row);
    expect(result?.fieldVersions).toEqual({});
  });
});

describe('actionToVerb', () => {
  it('should convert actions to past tense verbs', () => {
    expect(actionToVerb('create')).toBe('created');
    expect(actionToVerb('update')).toBe('updated');
    expect(actionToVerb('delete')).toBe('deleted');
  });
});
