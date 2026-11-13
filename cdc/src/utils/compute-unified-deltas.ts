import type { EntityHierarchy } from 'shared';
import { hierarchy } from 'shared';
import { isMaxMergeKey, signalVersionPrefix } from '#/modules/entities/counter-keys';
import { type VersionedSignal, versionedSignalsOf } from '#/modules/entities/stream/versioned-signals';
import type { CdcActivity, ParseMessageResult } from '../pipeline/parse-message';
import type { CdcRowData, PendingEvent } from '../types';
import { getCountDeltas } from './count-deltas';
import { isTombstone } from './is-tombstone';

/** One sequence group per organization (reserved by RETURNING UPSERT) plus accumulated count deltas. */
export interface BatchUnifiedDeltaPlan {
  /** One per organization: reserves `sequence` and stamps its events in WAL order. */
  orgSequenceGroups: OrgSequenceGroup[];
  /** Merged across all events by channelKey; excludes sequence and frontier deltas. */
  countDeltasByChannelKey: Map<string, Record<string, number>>;
}

/** The stampable changes of one organization in one flush, which take consecutive values of its sequence. */
export interface OrgSequenceGroup {
  /** The organization whose sequence this group reserves from. */
  orgKey: string;
  /** Stampable events in WAL order, one sequence value each; seq values are assigned after RETURNING. */
  events: PendingEvent[];
}

/**
 * Home key of a product row: its deepest populated ancestor, falling back to the activity organization; a missing
 * organization violates the hierarchy and throws. The API messages group a row by it when its product path cannot be
 * computed.
 */
export function resolveChannelKey(entityType: string, rowData: CdcRowData, activity: CdcActivity, h: EntityHierarchy = hierarchy): string {
  const deepest = h.resolveDeepestAncestorId(entityType, rowData);
  if (deepest) return deepest;
  if (activity.organizationId) return activity.organizationId;
  throw new Error(`No channel for ${entityType} row ${rowData.id}: the hierarchy model requires an organization ancestor`);
}

/** Merges deltas into those of a channel key: a count adds up, a stamp or a frontier keeps the highest value. */
export function mergeDelta(map: Map<string, Record<string, number>>, channelKey: string, deltas: Record<string, number>): void {
  const existing = map.get(channelKey);
  if (existing) {
    for (const [key, value] of Object.entries(deltas)) {
      existing[key] = isMaxMergeKey(key) ? Math.max(existing[key] ?? 0, value) : (existing[key] ?? 0) + value;
    }
  } else {
    map.set(channelKey, { ...deltas });
  }
}

/** The parts of a change that decide whether it is stamped. */
type StampableChange = Pick<ParseMessageResult, 'tableMeta' | 'activity' | 'rowData'>;

/** Whether a change gets a sequence value: one that leaves a product row in its table, a soft delete's tombstone included. */
export function isStampable({ tableMeta, activity: { action }, rowData }: StampableChange, h: EntityHierarchy = hierarchy): boolean {
  if (tableMeta.kind !== 'entity' || !h.isProduct(tableMeta.type)) return false;
  return action === 'create' || action === 'update' || (action === 'delete' && isTombstone(rowData));
}

/** The organization a stampable change reserves its sequence value from; a change without one violates the hierarchy. */
function organizationOf({ result: { tableMeta, activity, rowData } }: PendingEvent): string {
  if (!activity.organizationId) {
    throw new Error(`No organization for ${tableMeta.type} row ${rowData.id}: the hierarchy model requires an organization ancestor`);
  }
  return activity.organizationId;
}

/**
 * The versioned signals each change of a flush moves. A channel deleted under another channel the same flush deletes
 * moves none that names its row: the signal of the deleted root tells its readers to drop the whole subtree.
 */
export function flushSignals(events: PendingEvent[], h: EntityHierarchy = hierarchy): (event: PendingEvent) => VersionedSignal[] {
  const isChannelDelete = ({ result: { tableMeta, activity } }: PendingEvent) => activity.action === 'delete' && h.isChannel(tableMeta.type);
  const deletedChannelIds = new Set(events.filter(isChannelDelete).map(({ result }) => result.rowData.id));
  return (event) => {
    const { tableMeta, activity, rowData } = event.result;
    const signals = versionedSignalsOf(tableMeta.type, activity.action, h);
    const covered = isChannelDelete(event) && h.resolveNonNullAncestors(tableMeta.type, rowData).some(({ id }) => deletedChannelIds.has(id));
    return covered ? signals.filter(({ namesRow }) => !namesRow) : signals;
  };
}

/**
 * Reserves one sequence range per organization, shared by all product entity types and preserving WAL
 * order, and accumulates count deltas. Frontier (`e:f:`) deltas wait until seq values are assigned.
 */
export function computeBatchUnifiedDeltas(events: PendingEvent[], h: EntityHierarchy = hierarchy): BatchUnifiedDeltaPlan {
  const stamped = events.filter(({ result }) => isStampable(result, h));
  const orgSequenceGroups = [...Map.groupBy(stamped, organizationOf)].map(([orgKey, group]) => ({ orgKey, events: group }));

  const signalsOf = flushSignals(events, h);
  const countDeltasByChannelKey = new Map<string, Record<string, number>>();
  for (const event of events) {
    const { result, cascadeCounts } = event;
    for (const { channelKey, deltas } of getCountDeltas(result.tableMeta, result.activity, result.rowData, result.oldRowData, h, signalsOf(event))) {
      mergeDelta(countDeltasByChannelKey, channelKey, deltas);
    }
    // The rows a channel delete took with it: their own deletes were suppressed, and this change carries their counts.
    for (const [channelKey, deltas] of cascadeCounts ?? []) mergeDelta(countDeltasByChannelKey, channelKey, deltas);
  }

  return { orgSequenceGroups, countDeltasByChannelKey };
}

/**
 * The version each change of a flush gave its versioned signals: the flush's changes of one signal type in one
 * organization take the values just below the counter the flush left, in commit order, the last one the counter itself.
 * What the flush moved without a change of its own (a cascade's counts) sits below them, so a client sees a gap.
 * @param events - The changes the flush recorded, in commit order.
 * @param counters - The counter row of each organization as the flush left it.
 * @returns Per change, its versions by signal type: empty for a change another of its flush covers (`flushSignals`),
 *   absent for a change that moves none.
 */
export function signalVersionsOf(
  events: PendingEvent[],
  counters: Map<string, Record<string, number>>,
  h: EntityHierarchy = hierarchy,
): Map<PendingEvent, Record<string, number>> {
  const signalsOf = flushSignals(events, h);
  const next = new Map<string, number>();
  const versions = new Map<PendingEvent, Record<string, number>>();
  for (const event of events.toReversed()) {
    const { tableMeta, activity } = event.result;
    if (!activity.organizationId) continue;
    const signals = signalsOf(event);
    // A covered change carries an empty record, which tells the API to send no live signal for it either.
    if (signals.length < versionedSignalsOf(tableMeta.type, activity.action, h).length) versions.set(event, {});
    for (const { type } of signals) {
      const key = `${activity.organizationId}:${type}`;
      const version = next.get(key) ?? counters.get(activity.organizationId)?.[`${signalVersionPrefix}${type}`];
      if (version === undefined) continue;
      next.set(key, version - 1);
      versions.set(event, { ...versions.get(event), [type]: version });
    }
  }
  return versions;
}
