import { entityIdColumnKey, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { parseMessage } from '../pipeline/parse-message';
import { dmlMessage } from './factories';

/**
 * Snake-cased ancestor id columns for attachment, derived from the hierarchy config so the fixture passes under any
 * app topology: a row missing an ancestor column would fire the missing-ancestor warning on every edit.
 */
const ancestorIdColumns = Object.fromEntries(
  hierarchy
    .getOrderedAncestors('attachment')
    .map((ancestor) => [entityIdColumnKey(ancestor).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), `${ancestor}-1`]),
);

/** Raw pgoutput rows are snake_case. */
function attachmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'att-1', ...ancestorIdColumns, created_at: '2026-07-01T10:00:00.000Z', ...overrides };
}

describe('parseMessage: removed tombstones', () => {
  // apply_retention() removes tombstones every client already learned of; their removal must not reach anyone again.
  it('drops the hard delete of a tombstone and keeps the hard delete of a live row', () => {
    const tombstone = parseMessage(dmlMessage('delete', 'attachments', attachmentRow({ deleted_at: '2026-06-01T10:00:00.000Z' })));
    const live = parseMessage(dmlMessage('delete', 'attachments', attachmentRow({ deleted_at: null })));

    expect(tombstone).toBeNull();
    expect(live?.activity.action).toBe('delete');
  });
});
