/**
 * Tests for HLC-based field conflict resolution and no-op filtering.
 *
 * Enforces the core sync contract:
 * - Newer HLC timestamps win, older are silently dropped
 * - Missing stored HLC → first write, always accept
 * - Missing incoming HLC → untracked field, always accept
 * - No-op primitive fields are filtered out
 */

import { describe, expect, it } from 'vitest';
import { filterNoOpFields, resolveFieldConflicts } from '#/core/stx/field-versions';

describe('resolveFieldConflicts', () => {
  it('accepts all fields when no stored timestamps exist', () => {
    const incoming = { name: 'New', status: 'done' };
    const incomingTs = { name: '300:0001:aaa', status: '300:0002:aaa' };
    const result = resolveFieldConflicts(incoming, incomingTs, {});

    expect(result.acceptedFields).toEqual({ name: 'New', status: 'done' });
    expect(result.dropped).toEqual([]);
  });

  it('accepts fields with newer HLC than stored', () => {
    const incoming = { name: 'New', status: 'done' };
    const incomingTs = { name: '300:0001:aaa', status: '300:0002:aaa' };
    const storedTs = { name: '200:0001:bbb', status: '200:0001:bbb' };
    const result = resolveFieldConflicts(incoming, incomingTs, storedTs);

    expect(result.acceptedFields).toEqual({ name: 'New', status: 'done' });
    expect(result.dropped).toEqual([]);
  });

  it('drops fields with older HLC than stored', () => {
    const incoming = { name: 'Old', status: 'done' };
    const incomingTs = { name: '100:0001:aaa', status: '300:0002:aaa' };
    const storedTs = { name: '200:0001:bbb', status: '200:0001:bbb' };
    const result = resolveFieldConflicts(incoming, incomingTs, storedTs);

    expect(result.acceptedFields).toEqual({ status: 'done' });
    expect(result.dropped).toEqual(['name']);
  });

  it('drops fields with equal HLC (tie goes to stored)', () => {
    const incoming = { name: 'Tied' };
    const incomingTs = { name: '200:0001:aaa' };
    const storedTs = { name: '200:0001:aaa' };
    const result = resolveFieldConflicts(incoming, incomingTs, storedTs);

    expect(result.acceptedFields).toEqual({});
    expect(result.dropped).toEqual(['name']);
  });

  it('accepts fields with no incoming HLC (untracked)', () => {
    const incoming = { name: 'New' };
    const incomingTs = {}; // no HLC for name
    const storedTs = { name: '200:0001:bbb' };
    const result = resolveFieldConflicts(incoming, incomingTs, storedTs);

    expect(result.acceptedFields).toEqual({ name: 'New' });
    expect(result.dropped).toEqual([]);
  });

  it('handles empty incoming fields', () => {
    const result = resolveFieldConflicts({}, {}, { name: '200:0001:bbb' });

    expect(result.acceptedFields).toEqual({});
    expect(result.dropped).toEqual([]);
  });

  it('handles multiple fields with mixed results', () => {
    const incoming = { name: 'A', status: 'B', description: 'C' };
    const incomingTs = { name: '300:0001:aaa', status: '100:0001:aaa', description: '250:0001:aaa' };
    const storedTs = { name: '200:0001:bbb', status: '200:0001:bbb', description: '200:0001:bbb' };
    const result = resolveFieldConflicts(incoming, incomingTs, storedTs);

    expect(result.acceptedFields).toEqual({ name: 'A', description: 'C' });
    expect(result.dropped).toEqual(['status']);
  });
});

describe('filterNoOpFields', () => {
  it('removes primitive fields with identical values', () => {
    const entity = { name: 'Hello', status: 'active', count: 5 };
    const incoming = { name: 'Hello', status: 'done', count: 5 };
    const result = filterNoOpFields(entity, incoming);

    expect(result).toEqual({ status: 'done' });
  });

  it('keeps non-primitive fields even if structurally equal', () => {
    const entity = { labels: ['a', 'b'], name: 'Hello' };
    const incoming = { labels: ['a', 'b'], name: 'Hello' };
    const result = filterNoOpFields(entity, incoming);

    // labels kept (array, not primitive), name removed (same primitive)
    expect(result).toEqual({ labels: ['a', 'b'] });
  });

  it('keeps null if entity value is different', () => {
    const entity = { name: 'Hello' };
    const incoming = { name: null };
    const result = filterNoOpFields(entity, incoming);

    expect(result).toEqual({ name: null });
  });

  it('removes null if entity value is also null', () => {
    const entity = { name: null };
    const incoming = { name: null };
    const result = filterNoOpFields(entity, incoming);

    expect(result).toEqual({});
  });

  it('keeps boolean fields that changed', () => {
    const entity = { active: true };
    const incoming = { active: false };
    const result = filterNoOpFields(entity, incoming);

    expect(result).toEqual({ active: false });
  });

  it('removes boolean fields with same value', () => {
    const entity = { active: true };
    const incoming = { active: true };
    const result = filterNoOpFields(entity, incoming);

    expect(result).toEqual({});
  });

  it('returns empty object when all primitives are identical', () => {
    const entity = { name: 'X', status: 'done', count: 3 };
    const incoming = { name: 'X', status: 'done', count: 3 };
    const result = filterNoOpFields(entity, incoming);

    expect(result).toEqual({});
  });
});
