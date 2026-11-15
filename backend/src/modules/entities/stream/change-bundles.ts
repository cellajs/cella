import { type ActivityAction, actionToVerb, activityActions, hierarchy } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import type { ActivityRow } from '#/lib/activity-bus';
import { dispatchChange, dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import { maxStreamChangeRows } from '#/modules/entities/stream/helpers';
import type { StreamProductEvent } from '#/modules/entities/stream/types';
import { log } from '#/utils/logger';

/**
 * The shortest time between two sends of one audience under sustained change. A viewed scope reads at each frame, and
 * `readLimiter` allows 1,000 reads per 300 s: one busy audience spends 70% of a lone viewer's budget at 430 ms, and all
 * of it at 300 ms.
 */
export const changeBundleMs = 430;

/** Rows held across every audience past which everything held is sent: about 5 MB at about 1 KB a row. */
const maxHeldRows = 5000;

/** One audience's held changes: the shared fields of its first event, each row once, and the end of its interval. */
interface Bundle {
  event: StreamProductEvent;
  rows: Map<string, { action: ActivityAction; row: ActivityRow }>;
  timer: ReturnType<typeof setTimeout>;
}

/** Open intervals by audience: one stays open while its audience keeps changing. */
const bundles = new Map<string, Bundle>();
let heldRows = 0;
let closing = false;

/** The rows the same clients may read, as the worker groups its messages: organization, product type and home channel. */
const audienceOf = (event: StreamProductEvent, row: object = event) =>
  `${event.organizationId}|${event.entityType}|${hierarchy.resolveDeepestAncestorId(event.entityType, asRecord(row))}`;

/** The held bundles a change that goes at once must not overtake: its own audience's, and the old one of each moved row. */
function bundlesBefore(event: StreamProductEvent): Bundle[] {
  const moved = event.rows.flatMap(({ movedFrom }) => (movedFrom ? [audienceOf(event, movedFrom)] : []));
  return [...new Set([audienceOf(event), ...moved])].flatMap((key) => bundles.get(key) ?? []);
}

/** Dispatches one event: its change frames, and for an update the losses of its moved rows, side by side so a stalled reader delays neither. */
async function dispatch(event: StreamProductEvent): Promise<void> {
  try {
    await Promise.all([dispatchChange(event), event.action === 'update' && dispatchMoveOuts(event)]);
  } catch (error) {
    log.error('Failed to dispatch entity change event', { error, activityIds: event.rows.map((row) => row.activityId) });
  }
}

/**
 * Starts the dispatch of every row a bundle holds, one event per action, and empties it. The dispatches start in turn,
 * each writing before it awaits, which keeps the order of every stream.
 */
function sendHeld(bundle: Bundle): Promise<void>[] {
  const held = [...bundle.rows.values()];
  bundle.rows = new Map();
  heldRows -= held.length;
  return activityActions.flatMap((action) => {
    const rows = held.filter((entry) => entry.action === action).map(({ row }) => row);
    if (rows.length === 0) return [];
    return [dispatch({ ...bundle.event, type: `${bundle.event.entityType}.${actionToVerb(action)}`, action, rows })];
  });
}

/** Holds each row once: a later change replaces the earlier, except that an update of a created row stays a create. */
function hold(bundle: Bundle, event: StreamProductEvent): void {
  for (const row of event.rows) {
    const held = bundle.rows.get(row.rowData.id);
    if (!held) heldRows++;
    bundle.rows.set(row.rowData.id, { action: held?.action === 'create' && event.action === 'update' ? 'create' : event.action, row });
  }
}

const reachesRowBound = (bundle: Bundle) =>
  activityActions.some((action) => [...bundle.rows.values()].filter((entry) => entry.action === action).length >= maxStreamChangeRows);

/** Sends what the interval held and starts the next one; an audience that held nothing is quiet again. */
function endInterval(key: string, bundle: Bundle): void {
  if (bundle.rows.size === 0) {
    bundles.delete(key);
    return;
  }
  bundle.timer = setTimeout(() => endInterval(key, bundle), changeBundleMs);
  try {
    void Promise.all(sendHeld(bundle));
  } catch (error) {
    log.error('Failed to send held stream changes', { error, audience: key });
  }
}

/**
 * Sends a product event's change frames, paced per audience. The first change after a quiet interval goes at once and
 * opens an interval of `changeBundleMs`. Later changes wait for its end and go as one frame per action, each row with
 * its latest change. They go at once when a frame reaches `maxStreamChangeRows` rows or every audience together holds
 * `maxHeldRows`. A move, a message over `maxStreamChangeRows` rows and anything during shutdown go at once, after
 * what their audiences hold. Readers are decided when a frame is sent: a member removed meanwhile gets nothing.
 */
export async function bundleChange(event: StreamProductEvent): Promise<void> {
  if (closing || event.rows.length > maxStreamChangeRows || event.rows.some(({ movedFrom }) => movedFrom)) {
    await Promise.all([...bundlesBefore(event).flatMap(sendHeld), dispatch(event)]);
    return;
  }

  const key = audienceOf(event);
  const bundle = bundles.get(key);
  if (!bundle) {
    const opened: Bundle = { event, rows: new Map(), timer: setTimeout(() => endInterval(key, opened), changeBundleMs) };
    bundles.set(key, opened);
    await dispatch(event);
    return;
  }

  hold(bundle, event);
  if (heldRows >= maxHeldRows) await sendHeldChanges();
  else if (reachesRowBound(bundle)) await Promise.all(sendHeld(bundle));
}

/** Sends everything held and ends every interval: the next change of each audience goes at once. */
export async function sendHeldChanges(): Promise<void> {
  const held = [...bundles.values()];
  bundles.clear();
  for (const bundle of held) clearTimeout(bundle.timer);
  await Promise.all(held.flatMap(sendHeld));
}

/** At shutdown: sends what is held, and every later change goes at once. Resolves once the held frames are written. */
export async function closeChangeBundles(): Promise<void> {
  closing = true;
  await sendHeldChanges();
}
