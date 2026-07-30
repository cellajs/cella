import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/pino', () => ({
  log: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn() },
}));

import type { Pgoutput } from 'pg-logical-replication';
import { entityIdColumnKey, hierarchy } from 'shared';
import { log } from '../lib/pino';
import { parseMessage } from '../pipeline/parse-message';

const warn = vi.mocked(log.warn);

/**
 * Snake-cased ancestor id columns for attachment, derived from the hierarchy config so the
 * fixture passes under any app topology: a row missing an ancestor column would fire
 * `warnMissingAncestors` on every edit and drown the draft-guard warning this suite asserts on.
 */
const ancestorIdColumns = Object.fromEntries(
  hierarchy
    .getOrderedAncestors('attachment')
    .map((ancestor) => [entityIdColumnKey(ancestor).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), `${ancestor}-1`]),
);

/**
 * Raw pgoutput rows are snake_case. Injecting `published_at: null` simulates EXACTLY the
 * misconfiguration the guard exists for: an app added `publishedColumn` but did not
 * regenerate the publication, so draft rows leak into the stream.
 */
function attachmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'att-1', ...ancestorIdColumns, created_at: '2026-07-01T10:00:00.000Z', ...overrides };
}

function dmlMessage(tag: 'insert' | 'update' | 'delete', table: string, row: Record<string, unknown>, oldRow?: Record<string, unknown>): Pgoutput.Message {
  if (tag === 'delete') return { tag, relation: { name: table }, old: row } as unknown as Pgoutput.Message;
  return { tag, relation: { name: table }, new: row, old: oldRow ?? null } as unknown as Pgoutput.Message;
}

describe('parseMessage — draft entrance guard', () => {
  // The guard's warn timestamp is module state: step a monotonic fake clock 120s per
  // test so each starts outside the 60s rate-limit window, frozen within the test.
  let clock = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    clock += 120_000;
    vi.useFakeTimers();
    vi.setSystemTime(clock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops a draft product INSERT and warns (publication row filter missing)', () => {
    const result = parseMessage(dmlMessage('insert', 'attachments', attachmentRow({ published_at: null })));

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('publication row filter missing'), {
      entityType: 'attachment',
      action: 'create',
    });
  });

  it('drops a draft product UPDATE and a draft hard-DELETE (old-row snapshot checked)', () => {
    const update = parseMessage(
      dmlMessage('update', 'attachments', attachmentRow({ published_at: null }), attachmentRow({ published_at: null })),
    );
    const del = parseMessage(dmlMessage('delete', 'attachments', attachmentRow({ published_at: null })));

    expect(update).toBeNull();
    expect(del).toBeNull();
  });

  it('rate-limits the warning to one line per interval', () => {
    parseMessage(dmlMessage('insert', 'attachments', attachmentRow({ id: 'att-1', published_at: null })));
    parseMessage(dmlMessage('insert', 'attachments', attachmentRow({ id: 'att-2', published_at: null })));

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('passes a published product INSERT (the publish edge as delivered)', () => {
    const result = parseMessage(dmlMessage('insert', 'attachments', attachmentRow({ published_at: '2026-07-04T09:00:00.000Z' })));

    expect(result).not.toBeNull();
    expect(result?.activity.action).toBe('create');
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes an unpublish-as-DELETE (old row is published)', () => {
    const result = parseMessage(dmlMessage('delete', 'attachments', attachmentRow({ published_at: '2026-07-04T09:00:00.000Z' })));

    expect(result).not.toBeNull();
    expect(result?.activity.action).toBe('delete');
  });

  it('never drops channel rows: channel publishedAt gates invitees, not replication', () => {
    const result = parseMessage(
      dmlMessage('insert', 'organizations', { id: 'org-1', name: 'Org', created_at: '2026-07-01T10:00:00.000Z', published_at: null }),
    );

    expect(result).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
