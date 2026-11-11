import { recordFromKeys } from 'shared';
import { mockActivity } from '../../../backend/src/modules/activities/activities-mocks';
import type { CdcActivity, DmlMessage, ParseMessageResult } from '../pipeline/parse-message';
import type { ProductRow } from '../services/api-messages';
import type { PendingEvent, TableMeta } from '../types';
import { channelIdColumnKeys } from '../utils/channel-columns';

/**
 * A DML message as the pgoutput plugin delivers it: snake_case columns, the old image on updates and deletes. The cast
 * stands in for the relation metadata the plugin adds, which nothing under test reads.
 */
export function dmlMessage(
  tag: 'insert' | 'update' | 'delete',
  table: string,
  row: Record<string, unknown>,
  oldRow?: Record<string, unknown>,
): DmlMessage {
  if (tag === 'delete') return { tag, relation: { name: table }, old: row } as unknown as DmlMessage;
  return { tag, relation: { name: table }, new: row, old: oldRow ?? null } as unknown as DmlMessage;
}

/**
 * A table's registry entry with only what the pipeline reads: its kind, its type (a synthetic hierarchy's too) and the
 * drizzle table's SQL name, `${type}s`. The cast covers the rest of the table and the column map.
 */
export const tableMetaOf = (kind: TableMeta['kind'], type: string): TableMeta =>
  ({ kind, type, table: { [Symbol.for('drizzle:Name')]: `${type}s` } }) as unknown as TableMeta;

const defaultEntity: NonNullable<CdcActivity['entityType']> = 'attachment';
const defaultTable = 'attachments';

/** The seeded mock is the same on every call, and reseeding faker for each one is slow in a test of many changes, so it is built once. */
let cdcActivityDefaults: CdcActivity | undefined;

/** Activity with explicit test-friendly defaults, based on the backend mockActivity shape and named in every channel. */
export function mockCdcActivity(overrides: Partial<CdcActivity> = {}): CdcActivity {
  cdcActivityDefaults ??= {
    ...recordFromKeys(channelIdColumnKeys, () => null),
    ...mockActivity('cdc:default', {
      action: 'create',
      entityType: defaultEntity,
      resourceType: null,
      tableName: defaultTable,
      type: `${defaultEntity}.created` as CdcActivity['type'],
      tenantId: 'tenant-1',
      actorId: 'user-1',
      organizationId: 'org-1',
      changedFields: null,
      stx: null,
    }),
  };
  return { ...cdcActivityDefaults, ...overrides };
}

/** ParseMessageResult fixture. */
export function mockParseResult(
  overrides: {
    action?: CdcActivity['action'];
    entityType?: CdcActivity['entityType'];
    resourceType?: CdcActivity['resourceType'];
    subjectId?: string;
    organizationId?: string | null;
    tableMeta?: 'entity' | 'resource';
  } = {},
): ParseMessageResult {
  const type = overrides.entityType ?? overrides.resourceType ?? defaultEntity;
  const kind = overrides.tableMeta ?? (overrides.resourceType ? 'resource' : 'entity');

  const activity = mockCdcActivity({
    action: overrides.action ?? 'create',
    entityType: overrides.entityType ?? (kind === 'entity' ? (type as CdcActivity['entityType']) : null),
    resourceType: overrides.resourceType ?? null,
    subjectId: overrides.subjectId ?? `entity-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: overrides.organizationId ?? null,
    tableName: type,
    type: `${type}.${overrides.action === 'delete' ? 'deleted' : 'created'}` as CdcActivity['type'],
  });

  return { activity, rowData: { id: activity.subjectId ?? 'unknown' }, oldRowData: null, tableMeta: tableMetaOf(kind, type) };
}

type Row = Record<string, unknown> & { id?: string };

/** A change as the transaction buffer hands it on, in a source transaction of its own that commits at the change's position. */
export const pendingEvent = (lsn: string, result: ParseMessageResult): PendingEvent => ({
  lsn,
  commitLsn: lsn,
  commitEndLsn: lsn,
  index: 0,
  xid: 1,
  result,
});

/** A parsed change of one row as the pipeline hands it on; the activity's organization defaults to the row's. */
export function changeEvent({
  tableMeta,
  action,
  rowData,
  oldRowData = null,
  organizationId = (rowData.organizationId as string | undefined) ?? null,
  lsn = `0/${rowData.id}`,
}: {
  tableMeta: TableMeta;
  action: CdcActivity['action'];
  rowData: Row;
  oldRowData?: Row | null;
  organizationId?: string | null;
  lsn?: string;
}): PendingEvent {
  const entity = tableMeta.kind === 'entity';
  return pendingEvent(lsn, {
    activity: mockCdcActivity({
      action,
      organizationId,
      entityType: entity ? (tableMeta.type as CdcActivity['entityType']) : null,
      resourceType: entity ? null : (tableMeta.type as CdcActivity['resourceType']),
    }),
    rowData: rowData as ParseMessageResult['rowData'],
    oldRowData: oldRowData as ParseMessageResult['oldRowData'],
    tableMeta,
  });
}

/** PendingEvent fixture. */
export function mockPendingEvent(overrides: {
  lsn: string;
  action?: CdcActivity['action'];
  entityType?: CdcActivity['entityType'];
  resourceType?: CdcActivity['resourceType'];
  subjectId?: string;
  organizationId?: string | null;
  tableMeta?: 'entity' | 'resource';
}): PendingEvent {
  return pendingEvent(overrides.lsn, mockParseResult(overrides));
}

/** A recorded attachment row as its message is built from it; `extra` adds columns to the row. */
export function mockProductRow(seq: number, extra: Record<string, unknown> = {}, subjectId = `entity-${seq}`): ProductRow {
  const activity = mockCdcActivity({ subjectId });
  return { activity: { ...activity, id: `act-${seq}` }, rowData: { id: subjectId, seq, ...extra }, seq };
}
