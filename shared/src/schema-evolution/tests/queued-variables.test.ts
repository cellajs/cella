import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineLens } from '../define.ts';

// Lenses on columns that share a name with a holder of rows in queued variables (`rows`, `data`).
vi.mock('../lens-list', () => ({
  lenses: [
    defineLens({
      id: '2026-07-01-attachment-name-to-title',
      entityType: 'attachment',
      description: 'rename attachment.name → title',
      phase: 'expand',
      delta: { rename: { from: 'name', to: 'title' } },
    }),
    defineLens({
      id: '2026-07-02-attachment-rows-to-lines',
      entityType: 'attachment',
      description: 'rename attachment.rows → lines',
      phase: 'expand',
      delta: { rename: { from: 'rows', to: 'lines' } },
    }),
    defineLens({
      id: '2026-07-03-attachment-drop-data',
      entityType: 'attachment',
      description: 'drop attachment.data',
      phase: 'contract',
      delta: { drop: { field: 'data' } },
    }),
  ],
}));

import { migrateQueuedMutation, resetLensEngine } from '../engine.ts';

beforeEach(() => resetLensEngine());

const context = { tenantId: 't', organizationId: 'o' };

describe('migrateQueuedMutation on columns named like a holder of rows', () => {
  it('keeps the `rows` of a delete and the `data` of a create, and changes the columns inside their rows', () => {
    expect(migrateQueuedMutation('attachment', { ...context, rows: [{ id: 'a', name: 'x', rows: 3 }] }, 0)).toEqual({
      ...context,
      rows: [{ id: 'a', title: 'x', lines: 3 }],
    });
    expect(migrateQueuedMutation('attachment', { ...context, data: [{ id: 'a', name: 'x', data: { kept: false } }] }, 0)).toEqual({
      ...context,
      data: [{ id: 'a', title: 'x' }],
    });
  });

  it('changes the top level of variables that are one row themselves, whatever its columns are called', () => {
    expect(migrateQueuedMutation('attachment', { ...context, id: 'a', name: 'x', rows: 3, data: { kept: false } }, 0)).toEqual({
      ...context,
      id: 'a',
      title: 'x',
      lines: 3,
    });
  });

  it('changes the ops and stamps of an update and leaves its top level alone', () => {
    const update = { ...context, id: 'a', ops: { rows: 3 }, stx: { mutationId: 'm', fieldTimestamps: { rows: 'ts' } } };
    expect(migrateQueuedMutation('attachment', update, 0)).toEqual({
      ...context,
      id: 'a',
      ops: { lines: 3 },
      stx: { mutationId: 'm', fieldTimestamps: { lines: 'ts' } },
    });
  });
});
