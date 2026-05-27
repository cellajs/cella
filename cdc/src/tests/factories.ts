import { mockActivity } from '../../../backend/mocks/mock-activity';
import type { InsertActivityModel } from '#/db/schema/activities';
import type { ParseMessageResult } from '../pipeline/parse-message';
import type { PendingEvent, EntityTableMeta, ResourceTableMeta } from '../types';
import type { BatchEventInfo } from '../services/activity-service';

const DEFAULT_ENTITY: NonNullable<InsertActivityModel['entityType']> = 'attachment';
const DEFAULT_TABLE = 'attachments';

/** Activity with explicit test-friendly defaults. Uses backend mockActivity as base shape. */
export function mockCdcActivity(overrides: Partial<InsertActivityModel> = {}): InsertActivityModel {
  return mockActivity('cdc:default', {
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
    ...overrides,
  }) as InsertActivityModel;
}

/** ParseMessageResult for transaction-buffer, apply-unified-deltas tests */
export function mockParseResult(overrides: {
  action?: InsertActivityModel['action'];
  entityType?: InsertActivityModel['entityType'];
  resourceType?: InsertActivityModel['resourceType'];
  subjectId?: string;
  organizationId?: string | null;
  tableMeta?: 'entity' | 'resource';
} = {}): ParseMessageResult {
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

  const tableMeta = kind === 'entity'
    ? { kind: 'entity', type, table: {} } as unknown as EntityTableMeta
    : { kind: 'resource', type, table: {} } as unknown as ResourceTableMeta;

  return {
    activity,
    rowData: { id: activity.subjectId ?? 'unknown' },
    oldRowData: null,
    tableMeta,
  };
}

/** Full PendingEvent for flush-buffer tests */
export function mockPendingEvent(overrides: {
  lsn: string;
  action?: InsertActivityModel['action'];
  entityType?: InsertActivityModel['entityType'];
  resourceType?: InsertActivityModel['resourceType'];
  subjectId?: string;
  organizationId?: string | null;
  tableMeta?: 'entity' | 'resource';
}): PendingEvent {
  return {
    lsn: overrides.lsn,
    result: mockParseResult(overrides),
  };
}

/** BatchEventInfo for activity-service tests */
export function mockBatchEvent(seq: number, subjectId = `entity-${seq}`): BatchEventInfo {
  const activity = mockCdcActivity({ subjectId });
  return {
    activity: { ...activity, id: `act-${seq}` } as InsertActivityModel & { id: string },
    rowData: { id: subjectId, seq },
    seq,
  };
}
