import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { mockActivity } from '../../../backend/src/modules/activities/activities-mocks';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { ProductRow } from '../services/activity-service';
import type { PendingEvent, TableMeta } from '../types';

/**
 * A DML message as the pgoutput plugin delivers it: snake_case columns, the old image on updates and deletes. The cast
 * stands in for the relation metadata the plugin adds, which nothing under test reads.
 */
export function dmlMessage(
  tag: 'insert' | 'update' | 'delete',
  table: string,
  row: Record<string, unknown>,
  oldRow?: Record<string, unknown>,
): Pgoutput.Message {
  if (tag === 'delete') return { tag, relation: { name: table }, old: row } as unknown as Pgoutput.Message;
  return { tag, relation: { name: table }, new: row, old: oldRow ?? null } as unknown as Pgoutput.Message;
}

/**
 * A table's registry entry with only what the pipeline reads: its kind, its type (a synthetic hierarchy's too) and the
 * drizzle table's SQL name, `${type}s`. The cast covers the rest of the table and the column map.
 */
export const tableMetaOf = (kind: TableMeta['kind'], type: string): TableMeta =>
  ({ kind, type, table: { [Symbol.for('drizzle:Name')]: `${type}s` } }) as unknown as TableMeta;

const DEFAULT_ENTITY: NonNullable<InsertActivityModel['entityType']> = 'attachment';
const DEFAULT_TABLE = 'attachments';

/** The seeded mock is the same on every call, and reseeding faker for each one is slow in a test of many changes, so it is built once. */
let cdcActivityDefaults: InsertActivityModel | undefined;

/** Activity with explicit test-friendly defaults, based on the backend mockActivity shape. */
export function mockCdcActivity(overrides: Partial<InsertActivityModel> = {}): InsertActivityModel {
  cdcActivityDefaults ??= mockActivity('cdc:default', {
    action: 'create',
    entityType: DEFAULT_ENTITY,
    resourceType: null,
    tableName: DEFAULT_TABLE,
    type: `${DEFAULT_ENTITY}.created` as InsertActivityModel['type'],
    tenantId: 'tenant-1',
    userId: 'user-1',
    organizationId: 'org-1',
    changedFields: null,
    stx: null,
  }) as InsertActivityModel;
  return { ...cdcActivityDefaults, ...overrides };
}

/** ParseMessageResult fixture. */
export function mockParseResult(
  overrides: {
    action?: InsertActivityModel['action'];
    entityType?: InsertActivityModel['entityType'];
    resourceType?: InsertActivityModel['resourceType'];
    subjectId?: string;
    organizationId?: string | null;
    tableMeta?: 'entity' | 'resource';
  } = {},
): ParseMessageResult {
  const type = overrides.entityType ?? overrides.resourceType ?? DEFAULT_ENTITY;
  const kind = overrides.tableMeta ?? (overrides.resourceType ? 'resource' : 'entity');

  const activity = mockCdcActivity({
    action: overrides.action ?? 'create',
    entityType: overrides.entityType ?? (kind === 'entity' ? (type as InsertActivityModel['entityType']) : null),
    resourceType: overrides.resourceType ?? null,
    subjectId: overrides.subjectId ?? `entity-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: overrides.organizationId ?? null,
    tableName: type,
    type: `${type}.${overrides.action === 'delete' ? 'deleted' : 'created'}` as InsertActivityModel['type'],
  });

  return { activity, rowData: { id: activity.subjectId ?? 'unknown' }, oldRowData: null, tableMeta: tableMetaOf(kind, type) };
}

type Row = Record<string, unknown> & { id?: string };

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
  action: InsertActivityModel['action'];
  rowData: Row;
  oldRowData?: Row | null;
  organizationId?: string | null;
  lsn?: string;
}): PendingEvent {
  const entity = tableMeta.kind === 'entity';
  return {
    lsn,
    result: {
      activity: mockCdcActivity({
        action,
        organizationId,
        entityType: entity ? (tableMeta.type as InsertActivityModel['entityType']) : null,
        resourceType: entity ? null : (tableMeta.type as InsertActivityModel['resourceType']),
      }),
      rowData: rowData as ParseMessageResult['rowData'],
      oldRowData: oldRowData as ParseMessageResult['oldRowData'],
      tableMeta,
    },
  };
}

/** PendingEvent fixture. */
export function mockPendingEvent(overrides: {
  lsn: string;
  action?: InsertActivityModel['action'];
  entityType?: InsertActivityModel['entityType'];
  resourceType?: InsertActivityModel['resourceType'];
  subjectId?: string;
  organizationId?: string | null;
  tableMeta?: 'entity' | 'resource';
}): PendingEvent {
  return { lsn: overrides.lsn, result: mockParseResult(overrides) };
}

/** A recorded attachment row as its message is built from it; `extra` adds columns to the row. */
export function mockProductRow(seq: number, extra: Record<string, unknown> = {}, subjectId = `entity-${seq}`): ProductRow {
  const activity = mockCdcActivity({ subjectId });
  return { activity: { ...activity, id: `act-${seq}` } as InsertActivityModel & { id: string }, rowData: { id: subjectId, seq, ...extra }, seq };
}
